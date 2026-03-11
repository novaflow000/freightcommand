import React from 'react';

interface ShipmentListProps {
  shipments: any[];
}

export default function ShipmentList({ shipments }: ShipmentListProps) {
  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-md">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">BL Number</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Container</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carrier</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origin</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ETA</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {shipments.map((shipment) => (
            <tr key={shipment.bl_number} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{shipment.bl_number}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shipment.client}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shipment.container_number}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shipment.carrier}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shipment.origin}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shipment.destination}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                  ${shipment.current_status === 'Arrived' ? 'bg-green-100 text-green-800' : 
                    shipment.current_status === 'In Transit' ? 'bg-blue-100 text-blue-800' : 
                    'bg-yellow-100 text-yellow-800'}`}>
                  {shipment.current_status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shipment.eta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
