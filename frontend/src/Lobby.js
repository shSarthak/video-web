import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate hook for React Router
import Navbar from './Navbar';

const Lobby = () => {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const navigate = useNavigate(); // Using useNavigate for navigation

  // Update the correct state based on the input field's name
  const handleChange = (e) => {
    const { name, value } = e.target; // Get name and value from the input
    if (name === 'name') {
      setName(value); // Update name state
    } else if (name === 'room') {
      setRoom(value); // Update room state
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault(); // Prevent the default form submission behavior
    if (name && room) {
      // If both fields are filled, navigate to the room page
      navigate(`/room/${room}?name=${name}`);
    } else {
      alert("Please enter both your name and room number.");
    }
  };

  return (
    <>
      <Navbar />

      {/* Center the form in the viewport */}
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="w-80 p-8 bg-white rounded-lg shadow-lg border-2 border-solid border-black">
          <h1 className="text-2xl font-semibold text-center mb-6">Create Or Join Room</h1>

          <form className="flex flex-col Join-form" onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="name" className="block mb-2 text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={name}
                placeholder="Enter your name"
                onChange={handleChange}
                className="pl-3 pr-3 py-2 w-full border-2 border-solid rounded-lg border-gray-300"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="room" className="block mb-2 text-sm font-medium text-gray-700">Room No</label>
              <input
                type="text"
                id="room"
                name="room"
                value={room}
                placeholder="Enter room number"
                onChange={handleChange}
                className="pl-3 pr-3 py-2 w-full border-2 border-solid rounded-lg border-gray-300"
                required
              />
            </div>

            <div className="flex justify-center">
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 focus:outline-none"
              >
                Join Room
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default Lobby;
