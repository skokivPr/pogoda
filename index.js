document.addEventListener('DOMContentLoaded', () => {
    const apiKey =
        localStorage.getItem('openweathermap_api_key') ||
        '4d8fb5b93d4af21d66a2948710284366';

    let currentCity = 'Bolesławiec';
    let autoRefreshInterval;

    const searchButton = document.getElementById('search-button');
    const locationInput = document.getElementById('location-input');
    const errorMessage = document.getElementById('error-message');
    const bodyElement = document.body;
    const backgroundEffectsContainer = document.getElementById('background-effects');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');

    /** Meteocons style `fill` — to samo co w paczce @meteocons/svg/fill/ (CDN: cdn.meteocons.com/…/svg/fill/…). */
    const METEOCONS_FILL_BASE = 'https://cdn.jsdelivr.net/npm/@meteocons/svg@0.1.0/fill';

    const weatherIconMap = {
        '01d': 'clear-day',
        '01n': 'clear-night',
        '02d': 'partly-cloudy-day',
        '02n': 'partly-cloudy-night',
        '03d': 'cloudy',
        '03n': 'cloudy',
        '04d': 'overcast',
        '04n': 'overcast',
        '09d': 'rain',
        '09n': 'rain',
        '10d': 'rain',
        '10n': 'rain',
        '11d': 'thunderstorms-day',
        '11n': 'thunderstorms-night',
        '13d': 'snow',
        '13n': 'snow',
        '50d': 'fog',
        '50n': 'fog',
    };

    const createEffect = (effectType) => {
        const container = document.createElement('div');
        let elementTag;
        let elementClass;
        let count;
        switch (effectType) {
            case 'stars':
                container.className = 'stars';
                elementTag = 'div';
                elementClass = 'star';
                count = 100;
                break;
            case 'rain':
                container.className = 'rain-effect';
                elementTag = 'div';
                elementClass = 'drop';
                count = 50;
                break;
            case 'snow':
                container.className = 'snow-effect';
                elementTag = 'div';
                elementClass = 'flake';
                count = 100;
                break;
            case 'fog':
                container.id = 'fog-layer';
                return container;
            default:
                return container;
        }
        for (let i = 0; i < count; i++) {
            const el = document.createElement(elementTag);
            el.className = elementClass;
            if (effectType === 'stars') {
                const size = Math.random() * 3 + 1;
                el.style.cssText = `width:${size}px; height:${size}px; top:${Math.random() * 100}%; left:${Math.random() * 100}%; animation-delay:${Math.random() * 2}s;`;
            }
            if (effectType === 'rain') {
                el.style.cssText = `left:${Math.random() * 100}%; animation-duration:${0.5 + Math.random() * 0.5}s; animation-delay:${Math.random() * 2}s;`;
            }
            if (effectType === 'snow') {
                const size = Math.random() * 4 + 2;
                el.style.cssText = `width:${size}px; height:${size}px; left:${Math.random() * 100}%; animation-duration:${5 + Math.random() * 5}s; animation-delay:${Math.random() * 10}s;`;
            }
            container.appendChild(el);
        }
        return container;
    };

    function setLoadingState(isLoading) {
        const widgetContent = document.querySelector('.weather-widget');
        if (!widgetContent) return;
        widgetContent.style.transition = 'opacity 0.3s ease';
        widgetContent.style.opacity = isLoading ? '0.5' : '1';
    }

    function capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    async function getWeatherData(location) {
        if (!apiKey || !String(apiKey).trim()) {
            errorMessage.textContent =
                'Brak klucza API. Ustaw go w pliku index.js albo: localStorage.setItem("openweathermap_api_key", "TWÓJ_KLUCZ").';
            errorMessage.classList.remove('hidden');
            return;
        }
        setLoadingState(true);
        errorMessage.classList.add('hidden');

        try {
            const [weatherResponse, forecastResponse] = await Promise.all([
                fetch(
                    `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=metric&appid=${apiKey}&lang=pl`
                ),
                fetch(
                    `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&units=metric&appid=${apiKey}&lang=pl`
                ),
            ]);

            if (!weatherResponse.ok) throw new Error('Nie znaleziono miasta');
            if (!forecastResponse.ok) throw new Error('Błąd pobierania prognozy');

            const weatherData = await weatherResponse.json();
            const forecastData = await forecastResponse.json();

            updateUI(weatherData, forecastData);
            startAutoRefresh();
        } catch (error) {
            console.error('Błąd:', error);
            showError();
        } finally {
            setLoadingState(false);
        }
    }

    function processForecast(forecastList) {
        const dailyData = {};
        forecastList.forEach((item) => {
            const date = item.dt_txt.split(' ')[0];
            if (!dailyData[date]) {
                dailyData[date] = { temps: [], icons: [], pops: [] };
            }
            dailyData[date].temps.push(item.main.temp);
            dailyData[date].icons.push({
                icon: item.weather[0].icon,
                hour: new Date(item.dt * 1000).getHours(),
            });
            dailyData[date].pops.push(item.pop || 0);
        });

        return Object.entries(dailyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, data]) => {
                const maxTemp = Math.max(...data.temps);
                const minTemp = Math.min(...data.temps);
                const maxPop = Math.max(...data.pops);
                const representativeIcon =
                    data.icons.find((i) => i.hour >= 12 && i.hour < 15)?.icon ||
                    data.icons[Math.floor(data.icons.length / 2)].icon;

                return {
                    date: new Date(date + 'T12:00:00'),
                    maxTemp,
                    minTemp,
                    icon: representativeIcon,
                    precipitationChance: maxPop * 100,
                };
            });
    }

    function getTodayKey() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function updateUI(weather, forecast) {
        const conditionCode = weather.weather[0].icon;
        updateBackground(conditionCode);

        document.getElementById('location-name').textContent = weather.name;
        document.getElementById('country-name').textContent = weather.sys.country || '—';
        document.getElementById('current-temp').innerHTML = `${Math.round(weather.main.temp)}<span class="temp-unit">&deg;C</span>`;

        const processedDailyForecast = processForecast(forecast.list);
        const todayKey = getTodayKey();
        let todayForecast = processedDailyForecast.find(
            (d) =>
                `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}-${String(d.date.getDate()).padStart(2, '0')}` ===
                todayKey
        );
        if (!todayForecast && processedDailyForecast.length > 0) {
            todayForecast = processedDailyForecast[0];
        }

        const maxT = todayForecast
            ? todayForecast.maxTemp
            : weather.main.temp_max ?? weather.main.temp;
        const minT = todayForecast
            ? todayForecast.minTemp
            : weather.main.temp_min ?? weather.main.temp;
        const precipPct = todayForecast
            ? todayForecast.precipitationChance
            : Math.round((forecast.list[0]?.pop || 0) * 100);

        document.getElementById('current-max-temp').innerHTML = `${Math.round(maxT)}&deg;`;
        document.getElementById('current-min-temp').innerHTML = `${Math.round(minT)}&deg;`;

        const description = weather.weather[0].description;
        document.getElementById('current-weather-desc').textContent = capitalizeFirst(description);
        document.getElementById('current-weather-icon').innerHTML = getWeatherIcon(conditionCode);

        const sunrise = new Date(weather.sys.sunrise * 1000);
        const sunset = new Date(weather.sys.sunset * 1000);
        document.getElementById('sunrise-time').textContent = `${sunrise.getHours()}:${String(sunrise.getMinutes()).padStart(2, '0')}`;
        document.getElementById('sunset-time').textContent = `${sunset.getHours()}:${String(sunset.getMinutes()).padStart(2, '0')}`;

        document.getElementById('sunrise-icon').innerHTML = `<img src="${METEOCONS_FILL_BASE}/sunrise.svg" class="w-full h-full icon-glow" alt="Wschód słońca" loading="lazy" decoding="async">`;
        document.getElementById('sunset-icon').innerHTML = `<img src="${METEOCONS_FILL_BASE}/sunset.svg" class="w-full h-full icon-glow" alt="Zachód słońca" loading="lazy" decoding="async">`;

        document.getElementById('feels-like').textContent = `${Math.round(weather.main.feels_like)}°C`;
        document.getElementById('humidity').textContent = `${weather.main.humidity}%`;
        const windMs = weather.wind?.speed ?? 0;
        document.getElementById('wind-speed').textContent = `${Math.round(windMs * 3.6)} km/h`;
        document.getElementById('pressure').textContent = `${weather.main.pressure} hPa`;
        document.getElementById('precipitation').textContent = `${Math.round(precipPct)}%`;

        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = '';
        const startIdx = todayForecast
            ? processedDailyForecast.indexOf(todayForecast) + 1
            : 1;
        processedDailyForecast.slice(startIdx, startIdx + 5).forEach((day) => {
            const dayElement = document.createElement('div');
            dayElement.className = 'forecast-item';
            const dayName = day.date.toLocaleDateString('pl-PL', { weekday: 'short' });
            dayElement.innerHTML = `
                <p class="forecast-day">${dayName}</p>
                ${getWeatherIcon(day.icon, 'w-24 h-24')}
                <p class="forecast-temp">${Math.round(day.maxTemp)}<span class="text-gray-400">&deg;</span> / ${Math.round(day.minTemp)}<span class="text-gray-400">&deg;</span></p>
                <div class="forecast-precip">
                   <i class="wi wi-umbrella"></i>
                   <span class="forecast-precip-text">${Math.round(day.precipitationChance)}%</span>
                </div>
            `;
            forecastContainer.appendChild(dayElement);
        });
        updateLastUpdateTime();
    }

    function showError() {
        errorMessage.textContent = 'Nie znaleziono miasta. Spróbuj ponownie.';
        errorMessage.classList.remove('hidden');
    }

    function updateBackground(iconCode) {
        bodyElement.className = 'bg-gray-900';
        backgroundEffectsContainer.innerHTML = '';
        const condition = weatherIconMap[iconCode] || 'clear-day';
        const bgMap = {
            'clear-day': 'bg-clear-day',
            rain: 'bg-rain',
            overcast: 'bg-overcast',
            cloudy: 'bg-partly-cloudy-day',
            'partly-cloudy-day': 'bg-partly-cloudy-day',
            'thunderstorms-day': 'bg-thunderstorms',
            'thunderstorms-night': 'bg-thunderstorms',
            snow: 'bg-snow',
            fog: 'bg-fog',
            'clear-night': 'bg-clear-night',
            'partly-cloudy-night': 'bg-clear-night',
        };
        const bgClass = bgMap[condition];
        if (bgClass) {
            bodyElement.classList.add(bgClass);
            if (bgClass === 'bg-clear-night') backgroundEffectsContainer.appendChild(createEffect('stars'));
            if (bgClass === 'bg-rain' || bgClass === 'bg-thunderstorms')
                backgroundEffectsContainer.appendChild(createEffect('rain'));
            if (bgClass === 'bg-snow') backgroundEffectsContainer.appendChild(createEffect('snow'));
            if (bgClass === 'bg-fog') backgroundEffectsContainer.appendChild(createEffect('fog'));
        }
    }

    function getWeatherIcon(iconCode, sizeClass = 'weather-icon-large') {
        const slug = weatherIconMap[iconCode] || 'overcast';
        const alt = slug.replace(/-/g, ' ');
        return `<img src="${METEOCONS_FILL_BASE}/${slug}.svg" class="${sizeClass} icon-glow" alt="${alt}" loading="lazy" decoding="async">`;
    }

    function updateLastUpdateTime() {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        document.getElementById('last-update').textContent = `Ostatnia aktualizacja: ${time}`;
    }

    function startAutoRefresh() {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => getWeatherData(currentCity), 600000);
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('weather-theme') || 'dark';
        setTheme(savedTheme);
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('weather-theme', theme);
        if (theme === 'dark') {
            themeIcon.className = 'fas fa-sun';
        } else {
            themeIcon.className = 'fas fa-moon';
        }
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    }

    searchButton.addEventListener('click', () => {
        const location = locationInput.value.trim();
        if (location) {
            currentCity = location;
            getWeatherData(location);
        }
    });

    locationInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const location = locationInput.value.trim();
            if (location) {
                currentCity = location;
                getWeatherData(location);
            }
        }
    });

    themeToggle.addEventListener('click', toggleTheme);

    document.querySelectorAll('[draggable="true"]').forEach((el) => {
        el.removeAttribute('draggable');
    });
    document.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
    });
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    initTheme();
    getWeatherData(currentCity);
});
