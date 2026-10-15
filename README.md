# Calgary Physiotherapy Clinics Map & Outreach CRM 📍

A clean territory management and cold-calling dashboard for your clinic connectivity app.

This map pins **34 physiotherapy clinics** across **North-West (NW), North-East (NE), South-West (SW), and South-East (SE) Calgary**, loaded with street addresses, phone numbers, and coordinates.

---

## 🎯 How It Works (Clean Slate)

- **Zero Fake Stats**: All clinics start in a clean default state (**"To Call"**, 0 customers, blank profit margin, blank revenue, blank notes).
- **Your Calling Tool**: As you call each clinic in Calgary, click on their pin or card, hit **"Call Clinic"**, and type in what they say:
  - Are they interested in your app?
  - What are their profit margins?
  - How many patients/customers do they have?
  - Any extra information (e.g. software they use, decision maker's name, notes).
- **Instant Save**: Hit **"Save Clinic Data"** to store your notes and metrics directly in browser `localStorage`.

---

## 🚀 Quick Start

Open the map in your browser:
```bash
open "/Users/matthewlegault/Desktop/Clinic Map/index.html"
```
Or start the local Python server:
```bash
cd "/Users/matthewlegault/Desktop/Clinic Map"
python3 server.py
```
*Opens automatically at `http://localhost:8000`.*

---

## 🌟 Features Built For Your Calling Workflow

1. **34 Pinned Calgary Clinics**:
   - NW: 9 clinics
   - NE: 8 clinics
   - SW: 9 clinics
   - SE: 8 clinics
2. **Direct Phone Links**:
   - Each clinic card and the slide-out bar display the clinic's phone number with a 1-click **"Call Clinic"** button (`tel:`).
3. **Outreach Status Tracking**:
   - 📞 **To Call / Not Contacted** (Default state for all 34 clinics)
   - 💬 **In Talks / Follow Up Needed**
   - ⭐ **Interested in Using App**
   - 🟢 **Using My App (Customer)**
   - ❌ **Not Interested**
4. **Side Information Bar & Custom Fields**:
   - Enter their **Profit Margin %**, **Customers on App**, **Total Patients**, and **Who you spoke with**.
   - Type your conversation notes in the log box.
   - Use the **Custom Info Bar** to add any extra field you want on the fly (e.g., *EMR System: Jane App*, *Staff Size*, *Direct Billing*, etc.).
5. **Filters & Search**:
   - Filter by Calgary Quadrant (NW, NE, SW, SE).
   - Filter by status (e.g., view only clinics you've marked "Interested").
   - Filter: "Only clinics where I've added info / contacted".
6. **Save & Export**:
   - Export your entered data to CSV (Excel / Google Sheets).
   - Export full JSON backup so you never lose your notes.
