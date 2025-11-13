# AI Accessibility Map POC

This is a proof of concept developed for the DIR World Usability Day on November 13th, 2025. This tool will offer a textual description of a map given the bounds of the map and a geospatial feature. It is built utilizing NodeJS, OpenLayers, and Vite/React.

## Prerequisites

In order to set this up, you will need an Gemini API key in a .env file such as:

`GEMINI_API_KEY=*********************`

Please put this file in the server directory.

You will also need to run this with NodeJS, installable at: https://nodejs.org/en.

## Getting up and running

Once you've got both the .env file and NodeJS installed, you can go into the server directory in a terminal/command prompt and run the command:

`npm run start`

Then, go into the client directory and run the command:

`npm run dev`

Finally, open a browser and go to http://localhost:5173 to load the demo.
