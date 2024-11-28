import React from 'react';
import { Routes, Route } from 'react-router-dom'; // Import Routes and Route from react-router-dom
import Lobby from './Lobby'; // Assuming you have a Lobby component
import Room from './Room';  // Assuming you have a Room component

const App = () => {
  return (
    <Routes> {/* Using Routes to define route mappings */}
      <Route path="/" element={<Lobby />} /> {/* Route for the Lobby page */}
      <Route path="/room/:roomId" element={<Room />} /> {/* Route for the Room page */}
    </Routes>
  );
};

export default App;
