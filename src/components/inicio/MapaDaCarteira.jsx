import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { plural } from "@/lib/plural";

/** Raio do círculo pelo número de empresas (cresce devagar, para uma cidade grande não cobrir o mapa). */
export const raio = (total) => Math.min(6 + Math.sqrt(total) * 4, 28);

function Enquadramento({ pontos }) {
  const mapa = useMap();
  useEffect(() => {
    const ajustar = () => {
      mapa.invalidateSize({ pan: false });
      if (pontos.length) mapa.fitBounds(pontos, { padding: [34, 34], maxZoom: 10, animate: false });
    };
    ajustar();
    const observer = new ResizeObserver(ajustar);
    observer.observe(mapa.getContainer());
    return () => observer.disconnect();
  }, [mapa, pontos]);
  return null;
}

/** Mapa da carteira: um círculo por município, do tamanho do número de empresas. Mapa base do OpenStreetMap. */
export default function MapaDaCarteira({ municipios }) {
  const comPonto = municipios.filter((m) => Number.isFinite(m.latitude) && Number.isFinite(m.longitude));
  return (
    <MapContainer center={[-14.5, -52]} zoom={4} scrollWheelZoom={false} className="h-[380px] w-full rounded-lg" aria-label="Mapa das empresas por município">
      <Enquadramento pontos={comPonto.map((m) => [m.latitude, m.longitude])} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {comPonto.map((m) => (
        <CircleMarker key={`${m.uf}-${m.municipio}`} center={[m.latitude, m.longitude]} radius={raio(m.total)} pathOptions={{ color: "#1E764D", fillColor: "#1E764D", fillOpacity: 0.45, weight: 1.5 }}>
          <Tooltip>{m.municipio}/{m.uf}: {m.total}</Tooltip>
          <Popup>{m.municipio}/{m.uf}<br />{plural(m.total, "empresa", "empresas")}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
