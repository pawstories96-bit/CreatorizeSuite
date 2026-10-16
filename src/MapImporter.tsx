import { useEffect, useState } from "react";
import { api, type Project } from "./types";
import { Button } from "./ui";
export function MapImporter({
  project: p,
  shotId,
  refresh,
  notify,
  load,
}: {
  project: Project;
  shotId?: string;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  load: () => Promise<any>;
}) {
  const [lat, setLat] = useState(""),
    [lon, setLon] = useState(""),
    [radius, setRadius] = useState(250),
    [terrain, setTerrain] = useState(true),
    [busy, setBusy] = useState(false),
    [map, setMap] = useState<any>(null);
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    void api("/state")
      .then((state) =>
        setEndpoint(
          state.settings.overpassUrl ||
            "https://overpass.private.coffee/api/interpreter",
        ),
      )
      .catch((error) => notify(error.message));
  }, []);
  return (
    <section className="form-stack">
      <h3>Real geographic scene</h3>
      <details>
        <summary>Map data service</summary>
        <p className="form-hint">
          Public data services can be unavailable. For small areas, the default
          service can fall back to a single cached read from OpenStreetMap.
          Choose your own Overpass endpoint for other areas.
        </p>
        <label>
          Overpass endpoint
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </label>
        <Button
          small
          onClick={async () => {
            try {
              await api("/settings", "POST", {
                overpassUrl:
                  endpoint === "https://overpass.private.coffee/api/interpreter"
                    ? ""
                    : endpoint,
              });
              notify("Map endpoint saved");
            } catch (error: any) {
              notify(error.message);
            }
          }}
        >
          Save map endpoint
        </Button>
      </details>
      <p>
        Enter the location’s coordinates. Imports actual OpenStreetMap
        footprints and roads, with optional public terrain elevations. Missing
        building heights are explicitly marked as estimates.
      </p>
      <div className="form-grid">
        <label>
          Latitude
          <input
            aria-label="Map latitude"
            type="number"
            min="-80"
            max="80"
            step="0.0001"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </label>
        <label>
          Longitude
          <input
            aria-label="Map longitude"
            type="number"
            min="-179"
            max="179"
            step="0.0001"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
          />
        </label>
        <label>
          Radius in meters
          <input
            aria-label="Map radius"
            type="number"
            min="50"
            max="1000"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={terrain}
            onChange={(e) => setTerrain(e.target.checked)}
          />{" "}
          Include terrain elevations
        </label>
      </div>
      <Button
        disabled={busy || !lat || !lon}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await api(`/projects/${p.id}/maps`, "POST", {
              lat: Number(lat),
              lon: Number(lon),
              radius,
              terrain,
            });
            setMap(result);
            await load();
            await refresh();
            notify("Geographic data and attribution saved");
          } catch (e: any) {
            notify(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Fetching geographic data…" : "Import map geometry"}
      </Button>
      {map && (
        <div className="notice">
          <p>
            {map.buildings} buildings · {map.roads} roads ·{" "}
            {map.estimatedHeights} estimated heights
            {map.elevationOrigin != null
              ? ` · elevation origin ${map.elevationOrigin.toFixed(1)}m`
              : ""}
          </p>
          <Button
            disabled={busy || !shotId}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/projects/${p.id}/maps/apply`, "POST", {
                  path: map.path,
                  shotId,
                });
                await refresh();
                notify(
                  "Map scene applied to the selected shot. History retains the previous scene.",
                );
              } catch (e: any) {
                notify(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Replace current shot with map scene
          </Button>
        </div>
      )}
    </section>
  );
}
