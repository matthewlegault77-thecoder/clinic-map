// Calgary Clinic Outreach & Territory Management Dashboard
// App Logic & State Controller (Clean Baseline)

(function() {
  'use strict';

  // ================= STATE =================
  let clinics = [];
  let currentQuadrant = 'ALL';
  let currentStatus = 'ALL';
  let currentSearch = '';
  let onlyWithInfo = false;
  let sortBy = 'name_asc';
  let selectedClinicId = null;
  let map = null;
  let markers = {};
  let pinDropMode = false;
  let activeTileLayerKey = 'streets';
  let currentTileLayer = null;
  let currentOverlayLayer = null;

  // Storage key for clean baseline data
  const STORAGE_KEY = 'calgary_clinics_clean_v4';

  // High-Definition Real Map Layers (100% Free, NO API KEY Required)
  const TILE_LAYERS = {
    streets: {
      name: 'Calgary City Streets',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Calgary Metro Street Network',
      maxZoom: 19
    },
    osm: {
      name: 'OpenStreetMap Detailed',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    },
    satellite: {
      name: 'Satellite + Street Labels',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      overlayUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 18
    },
    topo: {
      name: 'Topographic & Parks',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Topo Base',
      maxZoom: 19
    }
  };

  // Outreach Statuses
  const STATUS_CONFIG = {
    to_call: {
      label: 'To Call',
      pillClass: 'badge-status-to_call',
      pinClass: 'pin-to_call',
      icon: 'fa-phone',
      pulse: false
    },
    in_talks: {
      label: 'In Talks',
      pillClass: 'badge-status-in_talks',
      pinClass: 'pin-in_talks',
      icon: 'fa-clock',
      pulse: false
    },
    interested: {
      label: 'Interested',
      pillClass: 'badge-status-interested',
      pinClass: 'pin-interested',
      icon: 'fa-star',
      pulse: false
    },
    using_app: {
      label: 'Using My App',
      pillClass: 'badge-status-using_app',
      pinClass: 'pin-using_app',
      icon: 'fa-check',
      pulse: true
    },
    not_interested: {
      label: 'Not Interested',
      pillClass: 'badge-status-not_interested',
      pinClass: 'pin-not_interested',
      icon: 'fa-xmark',
      pulse: false
    }
  };

  // Quadrant Centers & Coordinates
  const QUADRANT_CENTERS = {
    calgary: { center: [51.0447, -114.0719], zoom: 11 },
    nw: { center: [51.1150, -114.1650], zoom: 12 },
    ne: { center: [51.1000, -113.9700], zoom: 12 },
    sw: { center: [51.0100, -114.1100], zoom: 12 },
    se: { center: [50.9300, -113.9900], zoom: 12 },
    downtown: { center: [51.0450, -114.0700], zoom: 14 }
  };

  // ================= INITIALIZATION =================
  document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initMap();
    renderMarkers();
    updateUI();
    bindEvents();
  });

  // Load from LocalStorage or Default
  function loadData() {
    try {
      // Purge any legacy/demo data keys
      ['calgary_clinics_outreach_v2', 'calgary_clinics_dataset_v1', 'calgary_clinics_call_list_v2'].forEach(k => {
        try { localStorage.removeItem(k); } catch(e) {}
      });

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        clinics = JSON.parse(stored);
        // Drop clinics removed from the dataset as nonexistent, unless the user already logged something on them
        const REMOVED_IDS = ['nw-05', 'ne-09', 'sw-07', 'se-02', 'se-08'];
        clinics = clinics.filter(c => !(REMOVED_IDS.includes(c.id) && c.status === 'to_call' && !c.notes));
        // Backfill emails added to the dataset after this browser first saved
        INITIAL_CLINICS.forEach(init => {
          const c = clinics.find(c => c.id === init.id);
          if (c && !c.email && init.email) c.email = init.email;
        });
      } else {
        clinics = getInitialClinics();
        saveData();
      }
    } catch (e) {
      console.warn('Failed to load from localStorage, fallback to initial dataset', e);
      clinics = getInitialClinics();
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clinics));
    } catch (e) {
      console.error('Error saving data to localStorage', e);
    }
  }

  // ================= MAP SETUP =================
  function initMap() {
    map = L.map('map', {
      center: [51.0447, -114.0719],
      zoom: 11,
      zoomControl: false
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    setTileLayer(activeTileLayerKey);

    // Invalidate size to guarantee perfect full canvas rendering
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 250);
    window.addEventListener('resize', () => {
      if (map) map.invalidateSize();
    });

    map.on('click', (e) => {
      if (pinDropMode) {
        handlePinDrop(e.latlng);
      }
    });
  }

  function setTileLayer(key) {
    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
      currentTileLayer = null;
    }
    if (currentOverlayLayer) {
      map.removeLayer(currentOverlayLayer);
      currentOverlayLayer = null;
    }

    const cfg = TILE_LAYERS[key] || TILE_LAYERS.streets;
    currentTileLayer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom || 19
    }).addTo(map);

    // Add street labels overlay if available (e.g. for satellite)
    if (cfg.overlayUrl) {
      currentOverlayLayer = L.tileLayer(cfg.overlayUrl, {
        maxZoom: cfg.maxZoom || 18
      }).addTo(map);
    }

    activeTileLayerKey = key;

    document.querySelectorAll('.layer-check').forEach(el => {
      if (el.getAttribute('data-layer') === key) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    const labels = {
      streets: 'Calgary Streets',
      osm: 'OpenStreetMap',
      satellite: 'Satellite + Labels',
      topo: 'Topographic'
    };
    const labelEl = document.getElementById('currentLayerLabel');
    if (labelEl) labelEl.textContent = labels[key] || 'Map Style';
  }

  // ================= MARKER MANAGEMENT =================
  function renderMarkers() {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    const filtered = getFilteredClinics();

    filtered.forEach(clinic => {
      if (!clinic.lat || !clinic.lng) return;

      const conf = STATUS_CONFIG[clinic.status] || STATUS_CONFIG.to_call;

      // Pulse ring only for clinics actively using app
      const pulseHtml = (conf.pulse) ? `<div class="pulse-ring"></div>` : '';
      const customerBadge = (clinic.appCustomers && clinic.appCustomers > 0)
        ? `<div class="pin-customer-tag">${clinic.appCustomers}</div>` 
        : '';

      const iconHtml = `
        <div class="clinic-pin-wrapper">
          ${pulseHtml}
          <div class="clinic-pin ${conf.pinClass}">
            <div class="clinic-pin-inner">
              <i class="fa-solid ${conf.icon}"></i>
            </div>
          </div>
          ${customerBadge}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: iconHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -34]
      });

      const marker = L.marker([clinic.lat, clinic.lng], { icon: customIcon }).addTo(map);

      // Popup Content
      const marginDisplay = clinic.profitMargin ? `${clinic.profitMargin}%` : 'Not entered';
      const custDisplay = (clinic.appCustomers > 0) ? `${clinic.appCustomers}` : '0';

      const popupHtml = `
        <div class="p-3 bg-white text-slate-800">
          <div class="flex items-center justify-between gap-1 mb-1.5">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded badge-quadrant-${clinic.quadrant.toLowerCase()}">${clinic.quadrant} Calgary</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded ${conf.pillClass}">${conf.label}</span>
          </div>
          <h4 class="font-bold text-sm text-slate-900 leading-snug mb-1">${clinic.name}</h4>
          <p class="text-[11px] text-slate-500 mb-2 truncate">${clinic.address}</p>

          <div class="bg-blue-50/80 p-2 rounded-lg border border-blue-100 mb-2 text-xs flex items-center justify-between">
            <span class="font-bold text-blue-900">${clinic.phone}</span>
            <a href="tel:${clinic.phone}" class="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold">
              Call Now
            </a>
          </div>

          <div class="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 mb-2 text-xs">
            <div>
              <span class="text-slate-400 text-[10px] block">App Customers:</span>
              <span class="font-bold text-slate-800">${custDisplay}</span>
            </div>
            <div>
              <span class="text-slate-400 text-[10px] block">Profit Margin:</span>
              <span class="font-bold text-slate-800">${marginDisplay}</span>
            </div>
          </div>

          <button onclick="window.selectClinicFromMap('${clinic.id}')" class="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-pen-to-square"></i>
            <span>Open Info Bar & Edit</span>
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.bindTooltip(`<b>${clinic.name}</b><br>${clinic.phone}<br>Status: ${conf.label}`, {
        direction: 'top',
        offset: [0, -30]
      });

      marker.on('click', () => {
        highlightClinicCard(clinic.id);
      });

      markers[clinic.id] = marker;
    });
  }

  window.selectClinicFromMap = function(clinicId) {
    openClinicDossier(clinicId);
  };

  // ================= FILTERING & SORTING =================
  function getFilteredClinics() {
    let result = clinics.filter(c => {
      // Quadrant filter
      if (currentQuadrant !== 'ALL' && c.quadrant !== currentQuadrant) {
        return false;
      }
      // Status filter
      if (currentStatus !== 'ALL' && c.status !== currentStatus) {
        return false;
      }
      // Only With Info Filter
      if (onlyWithInfo) {
        const hasNotes = c.notes && c.notes.trim() !== '';
        const hasMargin = c.profitMargin && c.profitMargin !== '';
        const hasCust = c.appCustomers && c.appCustomers > 0;
        const hasCustomFields = c.customFields && c.customFields.length > 0;
        const isNotToCall = c.status !== 'to_call';
        if (!hasNotes && !hasMargin && !hasCust && !hasCustomFields && !isNotToCall) {
          return false;
        }
      }
      // Text Search
      if (currentSearch.trim() !== '') {
        const q = currentSearch.toLowerCase().trim();
        const customFieldText = (c.customFields || []).map(f => `${f.label} ${f.value}`).join(' ').toLowerCase();
        const searchMatches = 
          c.name.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.contactPerson && c.contactPerson.toLowerCase().includes(q)) ||
          (c.notes && c.notes.toLowerCase().includes(q)) ||
          customFieldText.includes(q);
        if (!searchMatches) return false;
      }
      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'customers_desc') {
        return (b.appCustomers || 0) - (a.appCustomers || 0);
      }
      if (sortBy === 'margin_desc') {
        const ma = parseFloat(a.profitMargin) || 0;
        const mb = parseFloat(b.profitMargin) || 0;
        return mb - ma;
      }
      if (sortBy === 'status_order') {
        const order = { using_app: 1, interested: 2, in_talks: 3, to_call: 4, not_interested: 5 };
        return (order[a.status] || 99) - (order[b.status] || 99);
      }
      return 0;
    });

    return result;
  }

  // ================= UI RENDERING =================
  function updateUI() {
    updateKPIs();
    renderClinicList();
    renderMarkers();
    updateQuadrantPillCounts();
  }

  // Live Progress Tracker
  function updateKPIs() {
    const total = clinics.length;
    const toCall = clinics.filter(c => c.status === 'to_call').length;
    const inTalks = clinics.filter(c => c.status === 'in_talks').length;
    const interested = clinics.filter(c => c.status === 'interested').length;
    const usingApp = clinics.filter(c => c.status === 'using_app').length;
    const totalCustomers = clinics.reduce((acc, c) => acc + (c.appCustomers || 0), 0);

    document.getElementById('kpiTotalClinics').textContent = total;
    document.getElementById('kpiToCall').textContent = toCall;
    document.getElementById('kpiInTalks').textContent = inTalks;
    document.getElementById('kpiInterested').textContent = interested;
    document.getElementById('kpiUsingApp').textContent = usingApp;
    document.getElementById('kpiTotalCustomers').textContent = totalCustomers.toLocaleString();
  }

  function updateQuadrantPillCounts() {
    const counts = {
      ALL: clinics.length,
      NW: clinics.filter(c => c.quadrant === 'NW').length,
      NE: clinics.filter(c => c.quadrant === 'NE').length,
      SW: clinics.filter(c => c.quadrant === 'SW').length,
      SE: clinics.filter(c => c.quadrant === 'SE').length
    };

    document.querySelectorAll('.quadrant-btn').forEach(btn => {
      const q = btn.getAttribute('data-quadrant');
      btn.innerHTML = `${q === 'ALL' ? 'All' : q} <span class="text-[9px] opacity-80">(${counts[q] || 0})</span>`;
    });
  }

  // Sidebar List
  function renderClinicList() {
    const container = document.getElementById('clinicListContainer');
    const filtered = getFilteredClinics();

    document.getElementById('filteredCountLabel').textContent = `${filtered.length} of ${clinics.length} clinics`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-filter-circle-xmark text-3xl mb-2 text-slate-300"></i>
          <p class="font-medium text-xs">No clinics match current filters</p>
          <button id="btnResetFilters" class="mt-2 text-xs text-blue-600 hover:underline">Reset filters</button>
        </div>
      `;
      const resetBtn = document.getElementById('btnResetFilters');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          currentQuadrant = 'ALL';
          currentStatus = 'ALL';
          currentSearch = '';
          onlyWithInfo = false;
          document.getElementById('searchInput').value = '';
          document.getElementById('statusFilter').value = 'ALL';
          document.getElementById('chkOnlyWithInfo').checked = false;
          setActiveQuadrantButton('ALL');
          updateUI();
        });
      }
      return;
    }

    container.innerHTML = filtered.map(clinic => {
      const conf = STATUS_CONFIG[clinic.status] || STATUS_CONFIG.to_call;
      const isSelected = clinic.id === selectedClinicId;
      const marginText = clinic.profitMargin ? `${clinic.profitMargin}% margin` : 'Margin: —';
      const custText = (clinic.appCustomers && clinic.appCustomers > 0) ? `${clinic.appCustomers} on app` : '0 on app';

      return `
        <div 
          class="clinic-card p-3 rounded-xl border border-slate-200/90 bg-white hover:border-blue-400 hover:shadow-md transition-all cursor-pointer ${isSelected ? 'clinic-card-selected' : ''}" 
          data-id="${clinic.id}"
        >
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded badge-quadrant-${clinic.quadrant.toLowerCase()}">${clinic.quadrant}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded ${conf.pillClass} flex items-center gap-1">
              <i class="fa-solid ${conf.icon} text-[9px]"></i>
              <span>${conf.label}</span>
            </span>
          </div>

          <h4 class="font-bold text-xs text-slate-900 leading-snug truncate">${clinic.name}</h4>
          <p class="text-[11px] text-slate-400 truncate mb-1.5">${clinic.address}</p>

          <!-- Phone & Metrics Row -->
          <div class="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100">
            <a href="tel:${clinic.phone}" onclick="event.stopPropagation()" class="font-bold text-blue-600 hover:underline flex items-center gap-1">
              <i class="fa-solid fa-phone text-[10px]"></i>
              <span>${clinic.phone}</span>
            </a>
            
            <div class="flex items-center gap-2 text-slate-500 text-[10px]">
              <span>${custText}</span>
              <span>&bull;</span>
              <span>${marginText}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.clinic-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        focusClinic(id);
      });
    });
  }

  function highlightClinicCard(clinicId) {
    document.querySelectorAll('.clinic-card').forEach(card => {
      if (card.getAttribute('data-id') === clinicId) {
        card.classList.add('clinic-card-selected');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        card.classList.remove('clinic-card-selected');
      }
    });
  }

  function focusClinic(clinicId) {
    const clinic = clinics.find(c => c.id === clinicId);
    if (!clinic) return;

    selectedClinicId = clinicId;
    highlightClinicCard(clinicId);

    if (clinic.lat && clinic.lng && map) {
      map.flyTo([clinic.lat, clinic.lng], 14, {
        duration: 0.8
      });

      const marker = markers[clinicId];
      if (marker) {
        setTimeout(() => marker.openPopup(), 400);
      }
    }

    openClinicDossier(clinicId);
  }

  // ================= CLINIC INFO BAR & EDITOR =================
  function openClinicDossier(clinicId) {
    const clinic = clinics.find(c => c.id === clinicId);
    if (!clinic) return;

    selectedClinicId = clinicId;
    const dossier = document.getElementById('clinicDossier');
    const conf = STATUS_CONFIG[clinic.status] || STATUS_CONFIG.to_call;

    // Header
    document.getElementById('dossierClinicName').textContent = clinic.name;
    document.getElementById('dossierAddress').textContent = clinic.address;
    
    const quadBadge = document.getElementById('dossierQuadrantBadge');
    quadBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded badge-quadrant-${clinic.quadrant.toLowerCase()}`;
    quadBadge.textContent = `${clinic.quadrant} CALGARY`;

    const statusBadge = document.getElementById('dossierStatusBadge');
    statusBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded ${conf.pillClass}`;
    statusBadge.textContent = conf.label.toUpperCase();

    renderContactBar(clinic);

    // Form inputs
    document.getElementById('editClinicName').value = clinic.name || '';
    document.getElementById('editQuadrant').value = clinic.quadrant || 'NW';
    document.getElementById('editStatus').value = clinic.status || 'to_call';
    document.getElementById('editAppCustomers').value = clinic.appCustomers ?? 0;
    document.getElementById('editTotalPatients').value = clinic.totalClinicPatients || '';
    document.getElementById('editProfitMargin').value = clinic.profitMargin || '';
    document.getElementById('editMonthlyRevenue').value = clinic.monthlyRevenue || '';
    document.getElementById('editContactPerson').value = clinic.contactPerson || '';
    document.getElementById('editStreetAddress').value = clinic.address || '';
    document.getElementById('editPhone').value = clinic.phone || '';
    document.getElementById('editEmail').value = clinic.email || '';
    document.getElementById('editNotes').value = clinic.notes || '';

    // Google Maps Link
    const gmapsLink = document.getElementById('btnGoogleMapsLink');
    if (gmapsLink) {
      gmapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.name + ', ' + clinic.address)}`;
    }

    renderCustomFieldsList(clinic);

    dossier.classList.remove('translate-x-full');
  }

  function closeClinicDossier() {
    document.getElementById('clinicDossier').classList.add('translate-x-full');
  }

  // Dynamic Custom Info Fields (Extra attributes)
  function renderCustomFieldsList(clinic) {
    const container = document.getElementById('customFieldsList');
    if (!clinic.customFields || clinic.customFields.length === 0) {
      container.innerHTML = `
        <p class="text-[11px] text-slate-400 italic">No extra custom fields added yet. Add one below as you learn more!</p>
      `;
      return;
    }

    container.innerHTML = clinic.customFields.map((field, idx) => `
      <div class="flex items-center justify-between gap-1.5 p-1.5 rounded-lg bg-white border border-indigo-100 text-xs">
        <span class="font-bold text-slate-700 min-w-[110px] truncate">${escapeHtml(field.label)}:</span>
        <input 
          type="text" 
          value="${escapeHtml(field.value)}" 
          data-field-idx="${idx}"
          class="custom-field-val-input flex-1 py-0.5 px-1.5 rounded border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
        />
        <button 
          onclick="window.removeCustomField(${idx})" 
          class="text-slate-400 hover:text-red-500 p-1 text-xs" 
          title="Remove field"
        >
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.custom-field-val-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.getAttribute('data-field-idx'), 10);
        if (clinic.customFields && clinic.customFields[idx]) {
          clinic.customFields[idx].value = e.target.value.trim();
        }
      });
    });
  }

  window.removeCustomField = function(idx) {
    const clinic = clinics.find(c => c.id === selectedClinicId);
    if (!clinic || !clinic.customFields) return;
    clinic.customFields.splice(idx, 1);
    renderCustomFieldsList(clinic);
  };

  function handleAddCustomField() {
    const keyInput = document.getElementById('newFieldKey');
    const valInput = document.getElementById('newFieldValue');
    const key = keyInput.value.trim();
    const val = valInput.value.trim();

    if (!key) {
      alert('Please enter a field name (e.g. EMR Software, Staff Size, Direct Billing)');
      return;
    }

    const clinic = clinics.find(c => c.id === selectedClinicId);
    if (!clinic) return;

    if (!clinic.customFields) {
      clinic.customFields = [];
    }

    clinic.customFields.push({ label: key, value: val || 'Yes' });
    keyInput.value = '';
    valInput.value = '';
    renderCustomFieldsList(clinic);
    showToast(`Added "${key}". Click Save Clinic Data to persist.`, 'info');
  }

  function renderContactBar(clinic) {
    document.getElementById('labelPhoneDisplay').textContent = clinic.phone || 'No phone';
    document.getElementById('btnCallPhoneLink').href = `tel:${clinic.phone || ''}`;
    document.getElementById('labelEmailDisplay').textContent = clinic.email || 'No email';
    document.getElementById('btnSendEmailLink').href = `mailto:${clinic.email || ''}`;
  }

  function handleSaveDossier() {
    const clinic = clinics.find(c => c.id === selectedClinicId);
    if (!clinic) return;

    const newName = document.getElementById('editClinicName').value.trim();
    if (!newName) {
      alert('Clinic name cannot be blank.');
      return;
    }

    clinic.name = newName;
    clinic.quadrant = document.getElementById('editQuadrant').value;
    clinic.status = document.getElementById('editStatus').value;
    clinic.appCustomers = parseInt(document.getElementById('editAppCustomers').value, 10) || 0;
    clinic.totalClinicPatients = document.getElementById('editTotalPatients').value.trim();
    clinic.profitMargin = document.getElementById('editProfitMargin').value.trim();
    clinic.monthlyRevenue = document.getElementById('editMonthlyRevenue').value.trim();
    clinic.contactPerson = document.getElementById('editContactPerson').value.trim();
    clinic.address = document.getElementById('editStreetAddress').value.trim();
    clinic.phone = document.getElementById('editPhone').value.trim();
    clinic.email = document.getElementById('editEmail').value.trim();
    clinic.notes = document.getElementById('editNotes').value.trim();

    saveData();
    updateUI();
    renderContactBar(clinic);
    highlightClinicCard(clinic.id);

    showToast(`Saved info for ${clinic.name}!`, 'success');
  }

  function handleDeleteClinic() {
    const clinic = clinics.find(c => c.id === selectedClinicId);
    if (!clinic) return;

    if (confirm(`Are you sure you want to remove "${clinic.name}" from your map?`)) {
      clinics = clinics.filter(c => c.id !== selectedClinicId);
      selectedClinicId = null;
      saveData();
      closeClinicDossier();
      updateUI();
      showToast('Clinic removed from map.', 'info');
    }
  }

  // ================= ADD NEW CLINIC MODAL =================
  function openAddClinicModal(lat = null, lng = null, quadrant = null) {
    const modal = document.getElementById('addClinicModal');
    document.getElementById('newClinicForm').reset();

    if (lat && lng) {
      document.getElementById('newClinicLat').value = lat.toFixed(5);
      document.getElementById('newClinicLng').value = lng.toFixed(5);
    }
    if (quadrant) {
      document.getElementById('newClinicQuadrant').value = quadrant;
    }

    modal.classList.remove('hidden');
  }

  function closeAddClinicModal() {
    document.getElementById('addClinicModal').classList.add('hidden');
  }

  function handleCreateClinic(e) {
    e.preventDefault();

    const name = document.getElementById('newClinicName').value.trim();
    const quadrant = document.getElementById('newClinicQuadrant').value;
    const status = document.getElementById('newClinicStatus').value;
    const address = document.getElementById('newClinicAddress').value.trim();
    const phone = document.getElementById('newClinicPhone').value.trim();
    const email = document.getElementById('newClinicEmail').value.trim();
    let lat = parseFloat(document.getElementById('newClinicLat').value);
    let lng = parseFloat(document.getElementById('newClinicLng').value);

    if (isNaN(lat) || isNaN(lng)) {
      const qCenters = {
        NW: [51.1200 + (Math.random() - 0.5) * 0.03, -114.1600 + (Math.random() - 0.5) * 0.03],
        NE: [51.1000 + (Math.random() - 0.5) * 0.03, -113.9700 + (Math.random() - 0.5) * 0.03],
        SW: [51.0100 + (Math.random() - 0.5) * 0.03, -114.1100 + (Math.random() - 0.5) * 0.03],
        SE: [50.9300 + (Math.random() - 0.5) * 0.03, -113.9900 + (Math.random() - 0.5) * 0.03]
      };
      const coord = qCenters[quadrant] || [51.0447, -114.0719];
      lat = coord[0];
      lng = coord[1];
    }

    const newId = `custom-${Date.now()}`;
    const newClinic = {
      id: newId,
      name,
      quadrant,
      status,
      address,
      lat,
      lng,
      phone,
      email,
      appCustomers: 0,
      totalClinicPatients: '',
      profitMargin: '',
      monthlyRevenue: '',
      contactPerson: '',
      notes: '',
      customFields: []
    };

    clinics.unshift(newClinic);
    saveData();
    closeAddClinicModal();
    updateUI();
    focusClinic(newId);
    showToast(`Added "${name}" to Calgary map!`, 'success');
  }

  function togglePinMode() {
    pinDropMode = !pinDropMode;
    const banner = document.getElementById('pinDropBanner');
    const mapEl = document.getElementById('map');

    if (pinDropMode) {
      banner.classList.remove('hidden');
      mapEl.classList.add('pin-drop-mode');
    } else {
      banner.classList.add('hidden');
      mapEl.classList.remove('pin-drop-mode');
    }
  }

  function handlePinDrop(latlng) {
    togglePinMode();
    const isNorth = latlng.lat >= 51.048;
    const isWest = latlng.lng <= -114.062;
    let guessedQuadrant = 'NW';
    if (isNorth && isWest) guessedQuadrant = 'NW';
    else if (isNorth && !isWest) guessedQuadrant = 'NE';
    else if (!isNorth && isWest) guessedQuadrant = 'SW';
    else if (!isNorth && !isWest) guessedQuadrant = 'SE';

    openAddClinicModal(latlng.lat, latlng.lng, guessedQuadrant);
  }

  // ================= PROGRESS MODAL =================
  function openAnalyticsModal() {
    const modal = document.getElementById('analyticsModal');
    
    const total = clinics.length;
    const toCall = clinics.filter(c => c.status === 'to_call').length;
    const interested = clinics.filter(c => c.status === 'interested').length;
    const usingApp = clinics.filter(c => c.status === 'using_app').length;

    document.getElementById('metricTotalClinics').textContent = total;
    document.getElementById('metricToCall').textContent = toCall;
    document.getElementById('metricInterested').textContent = interested;
    document.getElementById('metricUsingApp').textContent = usingApp;

    const quadrants = ['NW', 'NE', 'SW', 'SE'];
    const quadStats = quadrants.map(q => {
      const qClinics = clinics.filter(c => c.quadrant === q);
      const qTotal = qClinics.length;
      const qToCall = qClinics.filter(c => c.status === 'to_call').length;
      const qInTalks = qClinics.filter(c => c.status === 'in_talks').length;
      const qInterested = qClinics.filter(c => c.status === 'interested').length;
      const qUsing = qClinics.filter(c => c.status === 'using_app').length;

      return `
        <tr class="hover:bg-slate-100/60 transition-colors">
          <td class="py-2.5 font-bold">
            <span class="px-2 py-0.5 rounded badge-quadrant-${q.toLowerCase()}">${q} Calgary</span>
          </td>
          <td class="py-2.5">${qTotal}</td>
          <td class="py-2.5 text-slate-500 font-semibold">${qToCall}</td>
          <td class="py-2.5 text-sky-600 font-semibold">${qInTalks}</td>
          <td class="py-2.5 text-amber-600 font-semibold">${qInterested}</td>
          <td class="py-2.5 text-emerald-600 font-bold">${qUsing}</td>
        </tr>
      `;
    }).join('');

    document.getElementById('quadrantStatsTable').innerHTML = quadStats;
    modal.classList.remove('hidden');
  }

  function closeAnalyticsModal() {
    document.getElementById('analyticsModal').classList.add('hidden');
  }

  // ================= EXPORT & IMPORT =================
  function openExportImportModal() {
    document.getElementById('exportImportModal').classList.remove('hidden');
  }

  function closeExportImportModal() {
    document.getElementById('exportImportModal').classList.add('hidden');
  }

  function exportCSV() {
    if (clinics.length === 0) return;
    const headers = [
      'ID', 'Name', 'Quadrant', 'Phone', 'Email', 'Address', 'Status',
      'AppCustomers', 'TotalPatients', 'ProfitMargin', 'MonthlyRevenue',
      'ContactPerson', 'Notes'
    ];

    const rows = clinics.map(c => [
      `"${c.id}"`,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.quadrant}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.address || '').replace(/"/g, '""')}"`,
      `"${c.status}"`,
      c.appCustomers || 0,
      `"${c.totalClinicPatients || ''}"`,
      `"${c.profitMargin || ''}"`,
      `"${c.monthlyRevenue || ''}"`,
      `"${(c.contactPerson || '').replace(/"/g, '""')}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `calgary_physio_clinics_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported CSV spreadsheet!', 'success');
  }

  function exportJSON() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(clinics, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `calgary_clinics_saved_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Exported full JSON backup!', 'success');
  }

  function handleImportJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported) && imported.length > 0) {
          clinics = imported;
          saveData();
          updateUI();
          closeExportImportModal();
          showToast(`Imported ${imported.length} clinics successfully!`, 'success');
        } else {
          alert('Invalid file: JSON must contain an array of clinics.');
        }
      } catch (err) {
        alert('Could not parse JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function resetDefaultData() {
    if (confirm(`Reset to the initial clean list of ${INITIAL_CLINICS.length} clinics (all status set to To Call)?`)) {
      clinics = getInitialClinics();
      saveData();
      selectedClinicId = null;
      closeClinicDossier();
      updateUI();
      closeExportImportModal();
      showToast(`Reset to clean ${INITIAL_CLINICS.length} Calgary clinics.`, 'info');
    }
  }

  async function copyEmail(email) {
    if (!email) return showToast('No email to copy.', 'warning');
    try {
      await navigator.clipboard.writeText(email);
      showToast(`Copied ${email}`, 'success');
    } catch {
      // Clipboard API needs https or localhost
      showToast('Copy failed — select the email and press Cmd+C.', 'warning');
    }
  }

  // Toast
  let toastTimer = null;
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    toastMsg.textContent = message;
    if (type === 'success') {
      toastIcon.className = 'fa-solid fa-circle-check text-emerald-400 text-base';
    } else if (type === 'info') {
      toastIcon.className = 'fa-solid fa-circle-info text-cyan-400 text-base';
    } else {
      toastIcon.className = 'fa-solid fa-triangle-exclamation text-amber-400 text-base';
    }

    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'pointer-events-none');
    }, 3000);
  }

  // ================= EVENT BINDINGS =================
  function bindEvents() {
    // Quadrant Filters
    document.querySelectorAll('.quadrant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentQuadrant = btn.getAttribute('data-quadrant');
        setActiveQuadrantButton(currentQuadrant);
        updateUI();

        if (currentQuadrant !== 'ALL') {
          const focusKey = currentQuadrant.toLowerCase();
          const qCenter = QUADRANT_CENTERS[focusKey];
          if (qCenter && map) {
            map.flyTo(qCenter.center, qCenter.zoom, { duration: 0.8 });
          }
        }
      });
    });

    // Quick Zoom Buttons
    document.querySelectorAll('.quadrant-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const focusKey = btn.getAttribute('data-focus');
        const qCenter = QUADRANT_CENTERS[focusKey];
        if (qCenter && map) {
          map.flyTo(qCenter.center, qCenter.zoom, { duration: 0.8 });
        }
      });
    });

    // Search Input
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('btnClearSearch');

    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      if (currentSearch) {
        clearSearch.classList.remove('hidden');
      } else {
        clearSearch.classList.add('hidden');
      }
      renderClinicList();
      renderMarkers();
    });

    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      currentSearch = '';
      clearSearch.classList.add('hidden');
      renderClinicList();
      renderMarkers();
    });

    // Status Filter
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      currentStatus = e.target.value;
      renderClinicList();
      renderMarkers();
    });

    // Sort Select
    document.getElementById('sortSelect').addEventListener('change', (e) => {
      sortBy = e.target.value;
      renderClinicList();
    });

    // Only With Info Checkbox
    document.getElementById('chkOnlyWithInfo').addEventListener('change', (e) => {
      onlyWithInfo = e.target.checked;
      renderClinicList();
      renderMarkers();
    });

    // Pin Mode Button
    document.getElementById('btnPinMode').addEventListener('click', togglePinMode);
    document.getElementById('btnCancelPinDrop').addEventListener('click', togglePinMode);

    // Layer Toggle Dropdown
    const layerBtn = document.getElementById('btnLayerToggle');
    const layerDropdown = document.getElementById('layerDropdown');

    layerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      layerDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      layerDropdown.classList.add('hidden');
    });

    document.querySelectorAll('.layer-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const key = opt.getAttribute('data-layer');
        setTileLayer(key);
        layerDropdown.classList.add('hidden');
      });
    });

    // Dossier Actions
    document.getElementById('btnCloseDossier').addEventListener('click', closeClinicDossier);
    document.getElementById('btnCancelDossier').addEventListener('click', closeClinicDossier);
    document.getElementById('btnSaveDossier').addEventListener('click', handleSaveDossier);
    document.getElementById('btnDeleteClinic').addEventListener('click', handleDeleteClinic);
    document.getElementById('btnAddCustomField').addEventListener('click', handleAddCustomField);
    document.getElementById('btnCopyEmail').addEventListener('click', () => copyEmail(clinics.find(c => c.id === selectedClinicId)?.email));
    document.getElementById('btnCopyEditEmail').addEventListener('click', () => copyEmail(document.getElementById('editEmail').value.trim()));

    // Add Clinic Modal
    document.getElementById('btnAddClinicModal').addEventListener('click', () => openAddClinicModal());
    document.getElementById('btnCloseAddModal').addEventListener('click', closeAddClinicModal);
    document.getElementById('btnCancelAddModal').addEventListener('click', closeAddClinicModal);
    document.getElementById('newClinicForm').addEventListener('submit', handleCreateClinic);

    // Analytics Modal
    document.getElementById('btnOpenAnalytics').addEventListener('click', openAnalyticsModal);
    document.getElementById('btnCloseAnalytics').addEventListener('click', closeAnalyticsModal);
    document.getElementById('btnDismissAnalytics').addEventListener('click', closeAnalyticsModal);

    // Export / Import Modal
    document.getElementById('btnOpenExportImport').addEventListener('click', openExportImportModal);
    document.getElementById('btnCloseExportImport').addEventListener('click', closeExportImportModal);
    document.getElementById('btnDismissExportImport').addEventListener('click', closeExportImportModal);
    document.getElementById('btnDownloadCSV').addEventListener('click', exportCSV);
    document.getElementById('btnDownloadJSON').addEventListener('click', exportJSON);
    document.getElementById('fileImportJSON').addEventListener('change', handleImportJSON);
    document.getElementById('btnResetDefaultData').addEventListener('click', resetDefaultData);
    const headerResetBtn = document.getElementById('btnHeaderReset');
    if (headerResetBtn) {
      headerResetBtn.addEventListener('click', resetDefaultData);
    }

    // Mobile Sidebar Toggle
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
      const sidebar = document.getElementById('leftSidebar');
      sidebar.classList.toggle('hidden');
    });
  }

  function setActiveQuadrantButton(quadrant) {
    document.querySelectorAll('.quadrant-btn').forEach(btn => {
      if (btn.getAttribute('data-quadrant') === quadrant) {
        btn.className = 'quadrant-btn active py-1 rounded bg-blue-600 text-white font-semibold shadow-sm text-center';
      } else {
        btn.className = 'quadrant-btn py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-center';
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
