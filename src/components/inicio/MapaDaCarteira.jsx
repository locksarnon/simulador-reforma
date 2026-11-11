import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";

/** Raio do círculo pelo número de empresas (cresce devagar, para uma cidade grande não cobrir o mapa). */
export const raio = (total) => Math.min(6 + Math.sqrt(total) * 4, 28);

/** Mapa da carteira: um círculo por município, do tamanho do número de empresas. Mapa base do OpenStreetMap. */
export default function MapaDaCarteira({ municipios }) {
  const comPonto = municipios.filter((m) => m.latitude !== null && m.longitude !== null);
  return (
    <MapContainer center={[-14.5, -52]} zoom={4} scrollWheelZoom={false} className="h-[380px] w-full rounded-lg" aria-label="Mapa das empresas por município">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {comPonto.map((m) => (
        <CircleMarker key={`${m.uf}-${m.municipio}`} center={[m.latitude, m.longitude]} radius={raio(m.total)} pathOptions={{ color: "#1E764D", fillColor: "#1E764D", fillOpacity: 0.45, weight: 1.5 }}>
          <Tooltip>{m.municipio}/{m.uf}: {m.total}</Tooltip>
          <Popup>{m.municipio}/{m.uf}<br />{m.total} empresa(s)</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
