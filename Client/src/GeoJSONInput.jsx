import React, { useState } from 'react';

export default function GeoJSONInput({ onGeojsonChange }) {
  const [text, setText] = useState('');

  const handleLoad = () => {
    try {
      const parsed = JSON.parse(text);
      onGeojsonChange(parsed);
    } catch {
      alert('❌ Invalid GeoJSON');
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste your GeoJSON here..."
        className="w-full h-40 border p-2 rounded"
      />
      <button onClick={handleLoad} className="bg-blue-600 text-white px-4 py-2 mt-2 rounded">
        Load GeoJSON
      </button>
    </div>
  );
}
