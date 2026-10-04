(function(){
  async function loadGooglePlaces() {
    try {
      let googleMapsApiKey = window.EVEXEC_GOOGLE_MAPS_API_KEY || '';

      if (!googleMapsApiKey) {
        try {
          const cfg = window.evexecConfig ? await window.evexecConfig() : await fetch('/api/config').then(function(r){ return r.ok ? r.json() : {}; });
          googleMapsApiKey = cfg.googleMapsApiKey || cfg.googleMapsKey || '';
        } catch (_) {}
      }

      if (!googleMapsApiKey) {
        console.warn('Google Maps API key missing');
        return;
      }

      await new Promise(function(resolve, reject){
        if (window.google && window.google.maps && window.google.maps.places) {
          resolve();
          return;
        }

        const existing = document.querySelector('script[data-google-places]');
        if (existing) {
          existing.addEventListener('load', resolve);
          existing.addEventListener('error', reject);
          return;
        }

        window.__evExecMapsReady = resolve;

        const script = document.createElement('script');
        script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(googleMapsApiKey) + '&loading=async&libraries=places&callback=__evExecMapsReady';
        script.async = true;
        script.defer = true;
        script.dataset.googlePlaces = 'true';
        script.onerror = reject;
        document.head.appendChild(script);
      });

      const placesLib = await google.maps.importLibrary('places');
      const PlaceAutocompleteElement = placesLib.PlaceAutocompleteElement;

      initBookingAutocomplete(PlaceAutocompleteElement);
    } catch (err) {
      console.error('Places autocomplete failed', err);
    }
  }

  function initBookingAutocomplete(PlaceAutocompleteElement) {
    const addressInput = document.getElementById('bwAddress');

    // Never swap the field out from under someone who has already started typing.
    if (!addressInput || addressInput.dataset.googleAttached === 'true' || addressInput.value || document.activeElement === addressInput) {
      return;
    }

    addressInput.dataset.googleAttached = 'true';

    const autocomplete = new PlaceAutocompleteElement({
      componentRestrictions: { country: ['gb'] }
    });

    autocomplete.id = 'bwAddressAutocomplete';
    autocomplete.placeholder = addressInput.placeholder || 'Enter address';
    autocomplete.className = addressInput.className;

    addressInput.type = 'hidden';
    addressInput.insertAdjacentElement('afterend', autocomplete);

    const hiddenFields = createHiddenFields(addressInput.parentElement);

    autocomplete.addEventListener('gmp-select', async function(event) {
      const place = event.placePrediction.toPlace();

      await place.fetchFields({
        fields: ['addressComponents', 'formattedAddress']
      });

      const parsed = parseAddress(place.addressComponents || []);

      addressInput.value = place.formattedAddress || '';

      hiddenFields.street.value = parsed.street;
      hiddenFields.city.value = parsed.city;
      hiddenFields.postcode.value = parsed.postcode;
    });
  }

  function createHiddenFields(parent) {
    const street = document.createElement('input');
    street.type = 'hidden';
    street.id = 'bwStreet';
    street.name = 'street';

    const city = document.createElement('input');
    city.type = 'hidden';
    city.id = 'bwCity';
    city.name = 'city';

    const postcode = document.createElement('input');
    postcode.type = 'hidden';
    postcode.id = 'bwPostcode';
    postcode.name = 'postcode';

    parent.appendChild(street);
    parent.appendChild(city);
    parent.appendChild(postcode);

    return { street, city, postcode };
  }

  function parseAddress(components) {
    function get(type) {
      const found = components.find(function(c){
        return c.types && c.types.includes(type);
      });

      return found ? (found.longText || found.shortText || '') : '';
    }

    const streetNumber = get('street_number');
    const route = get('route');

    return {
      street: [streetNumber, route].filter(Boolean).join(' '),
      city: get('postal_town') || get('locality') || get('administrative_area_level_2') || '',
      postcode: get('postal_code') || ''
    };
  }

  // Google Maps is large, so it loads only when someone starts using the
  // booking form (the address field is on step 2, after they pick a
  // direction), not on every page view.
  var started = false;
  function start() {
    if (started) return;
    started = true;
    loadGooglePlaces();
  }
  function arm() {
    var form = document.getElementById('quote');
    if (!form) return;
    ['pointerdown', 'focusin', 'keydown', 'touchstart'].forEach(function (t) {
      form.addEventListener(t, start, { once: true, passive: true });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }
})();