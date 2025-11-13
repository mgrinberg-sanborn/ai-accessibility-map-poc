import React, { useState, useRef, useCallback } from 'react';
import MapView from './MapView';
import GeoJSONInput from './GeoJSONInput';
import { toLonLat } from 'ol/proj';
import { marked } from 'marked';

export default function App() {
  const [geojson, setGeojson] = useState(null);
  const [description, setDescription] = useState('');
  const lastRequestTimeRef = useRef(0);
  const debounceRef = useRef(null);

  const handleExtentChange = useCallback((extent) => {
    if (!geojson) return;

    // Clear previous debounce timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce: wait 1 second after last movement
    debounceRef.current = setTimeout(async () => {
      const now = Date.now();
      const FIVE_SECONDS = 5000;

      // Rate limit: only allow if 5s have passed
      if (now - lastRequestTimeRef.current < FIVE_SECONDS) {
        console.log('Request skipped due to rate limit');
        return;
      }
      lastRequestTimeRef.current = now;

      // Convert extent to bounding box in lat/lon
      const [minX, minY, maxX, maxY] = extent;
      const [west, south] = toLonLat([minX, minY]);
      const [east, north] = toLonLat([maxX, maxY]);
      const bbox = { west, south, east, north };

      let payloadGeojson = geojson;
      if (geojson.type === 'Feature') {
        payloadGeojson = {
          type: 'FeatureCollection',
          features: [geojson]
        };
      }

      try {
        const res = await fetch('http://localhost:3001/describe-extent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extent, bbox, geojson: payloadGeojson })
        });

        if (!res.ok) {
          console.error('AI request failed', res.status);
          return;
        }

        const data = await res.json();
        setDescription(data.description);
      } catch (err) {
        console.error('Error calling AI service:', err);
      }
    }, 3000); // 1 second debounce
  }, [geojson]);

  return (
    <div className="flex h-screen">
      <div className="w-2/3">
        <MapView onExtentChange={handleExtentChange} geojson={geojson} />
      </div>
      <div className="w-1/3 p-4 overflow-auto">
        <GeoJSONInput onGeojsonChange={setGeojson} />
        <div className="mt-4 bg-gray-100 p-4 rounded shadow">
          <h2 className="font-bold mb-2 text-lg">AI Description</h2>
          <div
            className="prose"
            dangerouslySetInnerHTML={{
              __html: description
                ? marked(description)
                : '🪄 Pan the map to get AI narration...',
            }}
          />
        </div>
      </div>
    </div>
  );
}
