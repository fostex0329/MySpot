import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartLineMultiple } from "@/components/chart-line-multiple";

// import { DotLottieReact } from "@lottiefiles/dotlottie-react";

import { Calendar18 } from "@/components/calendar18";
import { Button } from "@/components/ui/button";

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY as string;
const OPENCAGE_API_KEY = import.meta.env.VITE_OPENCAGE_API_KEY || "";

type HourlyForecastPoint = {
  time: string;
  temp: number;
  pop: number;
};

const HOURS_TO_DISPLAY = 24;
const FORECAST_INTERVAL_HOURS = 3;
const FORECAST_POINTS = Math.floor(HOURS_TO_DISPLAY / FORECAST_INTERVAL_HOURS);
const MIN_LOCATION_ACCURACY_METERS = 100;
const LOCATION_ACQUISITION_TIMEOUT_MS = 15_000;

const TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
});

const toPercent = (fraction: number) =>
  Math.max(0, Math.min(100, Math.round(fraction * 100)));

function buildThreeHourlyForecast(
  forecast: Array<{
    dt?: number;
    dt_txt?: string;
    main?: { temp?: number };
    pop?: number;
  }>
): HourlyForecastPoint[] {
  if (!Array.isArray(forecast)) {
    return [];
  }

  return forecast
    .slice(0, FORECAST_POINTS)
    .map((entry) => {
      if (!entry) {
        return null;
      }

      const timestamp =
        typeof entry.dt === "number"
          ? entry.dt * 1000
          : entry.dt_txt
          ? Date.parse(entry.dt_txt)
          : NaN;

      if (!Number.isFinite(timestamp)) {
        return null;
      }

      const temperature = entry.main?.temp;
      if (typeof temperature !== "number" || Number.isNaN(temperature)) {
        return null;
      }

      const probability =
        typeof entry.pop === "number" && Number.isFinite(entry.pop)
          ? entry.pop
          : 0;

      return {
        time: TIME_FORMATTER.format(new Date(timestamp)),
        temp: Math.round(temperature * 10) / 10,
        pop: toPercent(probability),
      };
    })
    .filter((point): point is HourlyForecastPoint => point !== null);
}

async function resolveLocationName(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<string | null> {
  if (!OPENCAGE_API_KEY) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      key: OPENCAGE_API_KEY,
      q: `${latitude},${longitude}`,
      language: "ja",
      limit: "1",
      no_annotations: "1",
    });

    const response = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?${params.toString()}`,
      { signal }
    );

    if (!response.ok) {
      console.warn("[weather] reverse geocode failed", {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = await response.json().catch(() => null);
    const result = data?.results?.[0];
    if (!result) {
      return null;
    }

    const city = result.components?.city;

    if (typeof city === "string" && city.trim().length > 0) {
      return city.trim();
    }

    return null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    console.warn("[weather] reverse geocode request failed", error);
    return null;
  }
}

export function SectionCards() {
  const [weather, setWeather] = useState<{
    name: string;
    temp: number;
    description: string;
    iconCode: string;
  } | null>(null);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecastPoint[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setLoading(false);
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();
    let watchId: number | null = null;
    let fallbackTimer: number | null = null;
    let bestPosition: GeolocationPosition | null = null;
    let hasFetched = false;

    const stopWatching = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const describeGeoError = (geoError: GeolocationPositionError) => {
      switch (geoError.code) {
        case 1:
          return "Location permission was denied.";
        case 2:
          return "Unable to determine your location.";
        case 3:
          return "Timed out while trying to retrieve your location.";
        default:
          return geoError.message || "Unable to retrieve your location.";
      }
    };

    const reportLocationError = (message: string) => {
      if (isCancelled) {
        return;
      }
      stopWatching();
      console.error("[weather] geolocation failed", message);
      setWeather(null);
      setHourlyForecast([]);
      setError(message);
      setLoading(false);
    };

    const fetchWeatherForPosition = async (position: GeolocationPosition) => {
      if (isCancelled) {
        return;
      }

      const { latitude, longitude } = position.coords;

      if (
        typeof latitude !== "number" ||
        Number.isNaN(latitude) ||
        typeof longitude !== "number" ||
        Number.isNaN(longitude)
      ) {
        reportLocationError("Received invalid coordinates from geolocation.");
        return;
      }

      if (!OPENWEATHER_API_KEY) {
        reportLocationError(
          "Missing OpenWeatherMap API key (VITE_OPENWEATHER_API_KEY)."
        );
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const baseParams = new URLSearchParams({
          lat: String(latitude),
          lon: String(longitude),
          units: "metric",
          lang: "ja",
          appid: OPENWEATHER_API_KEY,
        });
        const [currentRes, forecastRes] = await Promise.all([
          fetch(
            `https://api.openweathermap.org/data/2.5/weather?${baseParams.toString()}`,
            { signal: controller.signal }
          ),
          fetch(
            `https://api.openweathermap.org/data/2.5/forecast?${baseParams.toString()}`,
            { signal: controller.signal }
          ),
        ]);

        const [currentJson, forecastJson] = await Promise.all([
          currentRes.json().catch(() => null),
          forecastRes.json().catch(() => null),
        ]);

        if (!currentRes.ok) {
          const msg =
            currentJson && (currentJson.message || currentJson.error)
              ? `${currentRes.status} ${
                  currentJson.message || currentJson.error
                }`
              : `HTTP ${currentRes.status}`;
          throw new Error(msg);
        }

        if (!forecastRes.ok) {
          const msg =
            forecastJson && (forecastJson.message || forecastJson.error)
              ? `${forecastRes.status} ${
                  forecastJson.message || forecastJson.error
                }`
              : `HTTP ${forecastRes.status}`;
          throw new Error(msg);
        }

        if (
          !currentJson ||
          typeof currentJson.main?.temp !== "number" ||
          !Array.isArray(currentJson.weather) ||
          !currentJson.weather[0]
        ) {
          throw new Error("Current weather data is unavailable.");
        }

        if (
          !forecastJson ||
          !Array.isArray(forecastJson.list) ||
          forecastJson.list.length === 0
        ) {
          throw new Error("Hourly forecast data is unavailable.");
        }

        const hourlyData = buildThreeHourlyForecast(forecastJson.list);

        if (!hourlyData.length) {
          throw new Error("Unable to prepare hourly forecast data.");
        }

        const geocodedName = await resolveLocationName(
          latitude,
          longitude,
          controller.signal
        );

        if (isCancelled) {
          return;
        }

        setWeather({
          name: geocodedName || currentJson.name,
          temp: currentJson.main.temp,
          description: currentJson.weather[0].description,
          iconCode: currentJson.weather[0].icon,
        });
        setHourlyForecast(hourlyData);
      } catch (err) {
        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          isCancelled
        ) {
          return;
        }

        console.error("[weather] fetch failed", err, {
          latitude,
          longitude,
          accuracy: position.coords.accuracy,
        });

        setWeather(null);
        setHourlyForecast([]);
        setError((err as Error).message || "Failed to fetch weather data.");
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    const maybeUsePosition = (position: GeolocationPosition) => {
      if (isCancelled || hasFetched) {
        return;
      }

      const { latitude, longitude, accuracy } = position.coords;

      if (
        typeof latitude !== "number" ||
        Number.isNaN(latitude) ||
        typeof longitude !== "number" ||
        Number.isNaN(longitude)
      ) {
        return;
      }

      bestPosition = position;

      const accuracyValue =
        typeof accuracy === "number" && Number.isFinite(accuracy)
          ? accuracy
          : Number.POSITIVE_INFINITY;

      if (accuracyValue <= MIN_LOCATION_ACCURACY_METERS) {
        hasFetched = true;
        stopWatching();
        void fetchWeatherForPosition(position);
      }
    };

    const handleGeoError = (geoError: GeolocationPositionError) => {
      if (isCancelled) {
        return;
      }

      if (bestPosition && !hasFetched) {
        hasFetched = true;
        stopWatching();
        void fetchWeatherForPosition(bestPosition);
        return;
      }

      reportLocationError(describeGeoError(geoError));
    };

    watchId = navigator.geolocation.watchPosition(
      maybeUsePosition,
      handleGeoError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: LOCATION_ACQUISITION_TIMEOUT_MS,
      }
    );

    if (typeof window !== "undefined") {
      fallbackTimer = window.setTimeout(() => {
        if (isCancelled || hasFetched) {
          return;
        }

        if (bestPosition) {
          hasFetched = true;
          stopWatching();
          void fetchWeatherForPosition(bestPosition);
        } else {
          reportLocationError("Unable to refine your location.");
        }
      }, LOCATION_ACQUISITION_TIMEOUT_MS);
    }

    return () => {
      isCancelled = true;
      stopWatching();
      controller.abort();
    };
  }, []);

  return (
    <div className="@container/section-cards grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8 items-stretch">
      <div className="flex flex-col h-full">
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Current Weather</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : error ? (
              <p className="text-red-600">{error}</p>
            ) : weather ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-row gap-5 px-6 py-4">
                  <div className="flex flex-col gap-2">
                    <p className="text-lg font-semibold">{weather.name}</p>
                    <p className="origin-center text-4xl font-bold">
                      {weather.temp.toFixed(1)}°C
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <p className="capitalize">{weather.description}</p>
                    <img
                      src={`https://openweathermap.org/img/wn/${weather.iconCode}@2x.png`}
                      alt={weather.description}
                      className="h-16 w-16"
                    />
                  </div>

                  {/* <DotLottieReact
                    src={`/lotties/weather-icons/${weather.iconCode}.lottie`}
                    loop
                    autoplay
                    style={{ width: 200, height: 200 }}
                  /> */}
                </div>
                <div>
                  <ChartLineMultiple chartData={hourlyForecast} />
                </div>
              </div>
            ) : (
              <p>No weather data available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col h-full">
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent className="">
            <div className="px-6 py-4 mx-auto">
              <Calendar18 />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
