(function(){
  async function loadGooglePlaces() {
    try {
      let googleMapsApiKey = window.EVEXEC_GOOGLE_MAPS_API_KEY || '';

      if (!googleMapsApiKey) {
        try {
          const cfgRes = await fetch('/api/config');
          if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            googleMapsApiKey = cfg.googleMapsApiKey || cfg.googleMapsKey || '';
          }
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

    if (!addressInput || addressInput.dataset.googleAttached === 'true') {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGooglePlaces);
  } else {
    loadGooglePlaces();
  }
})();