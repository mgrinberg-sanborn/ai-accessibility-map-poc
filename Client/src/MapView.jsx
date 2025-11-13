import React, { useEffect, useRef } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';

export default function MapView({ onExtentChange, geojson }) {
  const mapRef = useRef();
  const vectorSourceRef = useRef(new VectorSource());

  useEffect(() => {
    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({ source: vectorSourceRef.current })
      ],
      view: new View({
        center: [0, 0],
        zoom: 2
      })
    });

    map.on('moveend', () => {
      const extent = map.getView().calculateExtent();
      onExtentChange(extent);
    });

    return () => map.setTarget(null);
  }, [onExtentChange]);

  useEffect(() => {
    if (geojson) {
      const features = new GeoJSON().readFeatures(geojson, {
        featureProjection: 'EPSG:3857'
      });
      vectorSourceRef.current.clear();
      vectorSourceRef.current.addFeatures(features);
    }
  }, [geojson]);

  return <div ref={mapRef} style={{ width: '100%', height: '600px' }} />;
}
