import React from 'react'
import logo from './images/logo.png';
const Navbar = () => {
  return (
    <>
        <div className="nav-list flex justify-between pb-2" style={{ backgroundColor: 'rgba(142,110,243)' }}>
        <div className="logo flex pl-3 pt-3">
          <img src={logo} style={{ height: '32px', paddingRight: '9px' }} alt="logo" />
          <p className="pt-1 text-white">Mumble</p>
        </div>
        <div className="pt-3 pr-3">
          <a href="#" className="text-white">lobby</a>
          <a href="#" className="ml-9 pl-4 pr-4 pt-1 pb-1 border-2 border-solid rounded-lg" style={{ backgroundColor: 'rgb(179, 102, 259)', color: 'white' }}>
            Create Room
          </a>
        </div>
      </div>
    </>
  )
}

export default Navbar