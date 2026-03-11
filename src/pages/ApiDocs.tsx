import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import AppHeader from "../components/AppHeader";

export default function ApiDocs() {
  return (
    <div className="h-screen w-full bg-gray-50 flex flex-col overflow-hidden">
      <AppHeader />
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 max-w-7xl mx-auto">
          <SwaggerUI url="/openapi.yaml" />
        </div>
      </div>
    </div>
  );
}
