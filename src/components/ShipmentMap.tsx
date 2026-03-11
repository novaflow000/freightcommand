import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface ShipmentMapProps {
  shipments: any[];
}

export default function ShipmentMap({ shipments }: ShipmentMapProps) {
  const center: [number, number] = [20, 0]; // Global view

  return (
    <MapContainer center={center} zoom={2} style={{ height: '500px', width: '100%' }} className="rounded-lg shadow-md">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {shipments.map((shipment) => (
        shipment.last_location && (
          <Marker 
            key={shipment.bl_number} 
            position={[shipment.last_location.lat, shipment.last_location.lng]}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-bold text-lg">{shipment.bl_number}</h3>
                <p className="text-sm text-gray-600">Carrier: {shipment.carrier}</p>
                <p className="text-sm text-gray-600">Status: {shipment.current_status}</p>
                <p className="text-sm text-gray-600">Origin: {shipment.origin}</p>
                <p className="text-sm text-gray-600">Dest: {shipment.destination}</p>
              </div>
            </Popup>
          </Marker>
        )
      ))}
    </MapContainer>
  );
}
