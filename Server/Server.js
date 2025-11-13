import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import proj4 from 'proj4';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

console.log('Server starting...');

proj4.defs("EPSG:4326", "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs");
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

app.post('/describe-extent', async (req, res) => {
  const { extent, geojson } = req.body;
  console.log('Incoming extent (likely Web Mercator):', extent);
  // console.log('Incoming geojson:', geojson); // Keep commented out if too verbose

  if (geojson.features && geojson.features.length > 0 && geojson.features[0].geometry) {
    console.log('First feature geometry (type and first few coords):',
      geojson.features[0].geometry.type,
      geojson.features[0].geometry.coordinates ? JSON.stringify(geojson.features[0].geometry.coordinates).substring(0, 200) + '...' : 'No coordinates'
    );
  } else {
    console.log('First feature geometry or coordinates not available for logging.');
  }

  if (!geojson || !geojson.features) {
    return res.status(400).json({ error: 'Invalid GeoJSON: Missing or malformed features array.' });
  }

  if (!Array.isArray(extent) || extent.length !== 4 || extent.some(isNaN)) {
    return res.status(400).json({ error: 'Invalid extent: Expected an array of 4 numbers [minX, minY, maxX, maxY].' });
  }

  function reprojectSingleCoordinate(coords, fromProj, toProj) {
      return proj4(fromProj, toProj, coords);
  }

  function reprojectGeometry(geometry, fromProj, toProj) {
      if (!geometry || !geometry.coordinates) return geometry;

      const newGeometry = { ...geometry };

      const type = geometry.type;

      if (type === 'Point') {
          newGeometry.coordinates = reprojectSingleCoordinate(geometry.coordinates, fromProj, toProj);
      } else if (type === 'LineString' || type === 'MultiPoint') {
          newGeometry.coordinates = geometry.coordinates.map(c => reprojectSingleCoordinate(c, fromProj, toProj));
      } else if (type === 'Polygon' || type === 'MultiLineString') {
          newGeometry.coordinates = geometry.coordinates.map(ringOrLine =>
              ringOrLine.map(c => reprojectSingleCoordinate(c, fromProj, toProj))
          );
      } else if (type === 'MultiPolygon') {
          newGeometry.coordinates = geometry.coordinates.map(polygon =>
              polygon.map(ring =>
                  ring.map(c => reprojectSingleCoordinate(c, fromProj, toProj))
              )
          );
      } else if (type === 'GeometryCollection') {
          newGeometry.geometries = geometry.geometries.map(geom => reprojectGeometry(geom, fromProj, toProj));
      }
      return newGeometry;
  }

  function extractCoordinates(geometry) {
    const coords = [];
    if (!geometry || !geometry.coordinates) {
      return coords;
    }

    const type = geometry.type;

    if (type === 'Point') {
      coords.push(geometry.coordinates);
    } else if (type === 'LineString' || type === 'MultiPoint') {
      geometry.coordinates.forEach(c => coords.push(c));
    } else if (type === 'Polygon' || type === 'MultiLineString') {
      geometry.coordinates.forEach(ringOrLine => {
        ringOrLine.forEach(c => coords.push(c));
      });
    } else if (type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => {
        polygon.forEach(ring => {
          ring.forEach(c => coords.push(c));
        });
      });
    } else if (type === 'GeometryCollection') {
        geometry.geometries.forEach(geom => {
            coords.push(...extractCoordinates(geom));
        });
    }
    return coords;
  }

  function getFeatureBBox(feature) {
    if (!feature || !feature.geometry) {
      return null;
    }

    const allCoords = extractCoordinates(feature.geometry);

    if (allCoords.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const coordPair of allCoords) {
      if (Array.isArray(coordPair) && coordPair.length === 2) {
        const [x, y] = coordPair;
        if (typeof x === 'number' && typeof y === 'number') {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
      }
    }

    if (minX === Infinity) {
      return null;
    }

    return [minX, minY, maxX, maxY];
  }

  function bboxesIntersect(b1, b2) {
    if (!b1 || !b2) return false;
    return !(b2[0] > b1[2] ||
             b2[2] < b1[0] ||
             b2[1] > b1[3] ||
             b2[3] < b1[1]);
  }

  const reprojectedFeatures = geojson.features.map(f => {
      if (f.geometry && f.geometry.coordinates) {
          return {
              ...f,
              geometry: reprojectGeometry(f.geometry, "EPSG:4326", "EPSG:3857")
          };
      }
      return f;
  });


  const featuresInExtent = reprojectedFeatures.filter((f, index) => {
    if (!f.geometry || !f.geometry.coordinates) {
        return false;
    }
  
    const featureBBox = getFeatureBBox(f);
    
    if (!featureBBox) {
        return false;
    }
    const intersects = bboxesIntersect(extent, featureBBox);
    return intersects;
  });

  // --- MODIFIED HERE: Create a detailed feature description for the AI ---
  const detailedFeatureDescriptions = featuresInExtent
    .map(f => {
      const bbox = getFeatureBBox(f);
      const featureId = f._id || f.id || 'Unnamed Feature';

      // Log to console for debugging (this is what you were seeing)
      console.log(`--- Detected Feature: ${featureId} ---`);
      console.log(`Type: ${f.geometry.type}`);
      console.log(`Reprojected BBox (Web Mercator): [${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}]`);
      if (f.properties) {
        console.log('Properties:', JSON.stringify(f.properties, null, 2));
      } else {
        console.log('Properties: None');
      }
      console.log('-----------------------------------');

      // This is the string that will be sent to the AI
      return `Feature ID: ${featureId}\n` +
             `  Type: ${f.geometry.type}\n` +
             `  Reprojected BBox (Web Mercator): [${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}]\n` +
             `  Properties: ${JSON.stringify(f.properties || {}, null, 0)}`; // Stringify properties without extra formatting
    });

  // Join the detailed descriptions into a single string for the prompt
  const aiInputFeatures = detailedFeatureDescriptions.join('\n\n'); // Separate features with double newline

  console.log(`Final Features in extent summary for console: ${featuresInExtent.map(f => `${f.geometry.type} ${f._id || f.id || ''}`).join(', ') || 'None'}`);
  // --- END MODIFICATION ---

  const prompt = `
  You are an AI geospatial assistant. Describe the features visible in the map extent:
  Map Extent Viewport (Web Mercator): [${extent[0]}, ${extent[1]}, ${extent[2]}, ${extent[3]}]

  Detailed GeoJSON Features found within the extent:
  ${aiInputFeatures || 'No GeoJSON features found in this area.'}

  Return a clear, human-readable summary of what’s in the viewport. Begin by describing the geographic area of the viewport given such as any major landforms, cities, mountain ranges, other geographic features that would be within this geographic extent that you know of. Focus only on the specific features inside the viewport and nothing else. You do not need to describe the surrounding environment, or the climate or the vegetation, solely any actual features such as mountains, cities, towns, rivers, etc. but only when they are in the viewport. Double check your bounds against a map before responding. I need you to describe with a high degree of accuracy what is inside the viewport. Then, if you were given a GeoJSON of features, focus on the types of geographic features, their key properties, and their spatial relationships within the given extent. Before explaining these features, note that they are visible in the provided GeoJSON. If above I wrote exactly 'No GeoJSON features found in this area' exactly, just reply that no features were provided. Be concise but informative.
  `;

  // console.log("--- Prompt sent to AI ---");
  // console.log(prompt);
  // console.log("--- End Prompt ---");


  try {
    const geminiResponse = await fetch(`${GEMINI_API_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
      return res.status(geminiResponse.status).json({
        error: 'AI service error: Unable to get a response from Gemini API.',
        details: errorText
      });
    }

    const aiResponseData = await geminiResponse.json();

    const aiResponseText = aiResponseData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponseText) {
      console.error('AI raw response did not contain expected text:', aiResponseData);
      return res.status(500).json({ error: 'AI service error: No readable text found in AI response.' });
    }

    res.json({ description: aiResponseText });

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: 'Internal server error while communicating with AI service.' });
  }
});

app.get('/', (req, res) => {
    res.send('Geospatial AI Assistant API is running!');
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));