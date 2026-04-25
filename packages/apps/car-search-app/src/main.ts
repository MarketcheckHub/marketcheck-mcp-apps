/* ================================================================
   MarketCheck Car Search — Standalone Web Application
   A responsive car search app with Search/SERP, Vehicle Details,
   and NLP Search views. Uses MarketCheck API via CORS proxy.
   ================================================================ */

// ─── Types ───────────────────────────────────────────────────────

interface CarListing {
  id: string;
  vin: string;
  heading: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_type: string;
  fuel_type: string;
  drivetrain: string;
  transmission: string;
  engine: string;
  exterior_color: string;
  interior_color: string;
  price: number;
  miles: number;
  city: string;
  state: string;
  zip: string;
  dealer_name: string;
  vdp_url: string;
  dom: number;
  first_seen: string;
  city_mpg: number;
  highway_mpg: number;
  doors: number;
  predicted_price?: number;
  is_cpo?: boolean;
  photo_url?: string;
  photo_urls: string[];
  options: string[];
  features: string[];
  seller_comments: string;
  cylinders: number;
  engine_size: string;
  msrp: number;
}

interface SearchFilters {
  make?: string;
  model?: string;
  year_range?: string;
  price_range?: string;
  miles_range?: string;
  body_type?: string;
  fuel_type?: string;
  drivetrain?: string;
  exterior_color?: string;
  interior_color?: string;
  zip?: string;
  radius?: string;
  sort_by?: string;
  rows: number;
  start: number;
}

// ─── Constants ───────────────────────────────────────────────────

const TOP_MAKES = [
  "Toyota","Honda","Ford","Chevrolet","BMW","Mercedes-Benz","Audi",
  "Hyundai","Kia","Nissan","Subaru","Volkswagen","Lexus","Mazda",
  "Jeep","Ram","GMC","Dodge","Acura","Infiniti","Volvo","Tesla",
  "Porsche","Land Rover","Cadillac",
];

const MODELS_BY_MAKE: Record<string, string[]> = {
  Toyota:["Camry","Corolla","RAV4","Highlander","Tacoma","Tundra","4Runner","Prius","Supra","GR86","Venza","Sienna","Crown"],
  Honda:["Civic","Accord","CR-V","HR-V","Pilot","Passport","Odyssey","Ridgeline","Fit"],
  Ford:["F-150","Mustang","Explorer","Escape","Bronco","Ranger","Edge","Maverick","Expedition","Mach-E"],
  Chevrolet:["Silverado","Equinox","Tahoe","Camaro","Corvette","Traverse","Blazer","Malibu","Colorado","Suburban"],
  BMW:["3 Series","5 Series","X3","X5","X1","4 Series","7 Series","X7","iX","i4"],
  "Mercedes-Benz":["C-Class","E-Class","GLC","GLE","S-Class","A-Class","CLA","GLA","GLB","EQS"],
  Audi:["A4","A6","Q5","Q7","A3","Q3","e-tron","A5","Q8","RS5"],
  Hyundai:["Tucson","Santa Fe","Elantra","Sonata","Kona","Palisade","Ioniq 5","Ioniq 6","Venue"],
  Kia:["Sportage","Telluride","Forte","K5","Seltos","Sorento","Soul","EV6","Carnival"],
  Nissan:["Altima","Rogue","Sentra","Pathfinder","Murano","Frontier","Kicks","Ariya","LEAF"],
  Subaru:["Outback","Forester","Crosstrek","Impreza","WRX","Ascent","Legacy","BRZ","Solterra"],
  Volkswagen:["Jetta","Tiguan","Atlas","Golf","Taos","ID.4","Arteon","GTI"],
  Lexus:["RX","ES","NX","IS","GX","UX","LC","LS","LX","RZ"],
  Mazda:["CX-5","CX-50","Mazda3","CX-9","CX-30","MX-5 Miata","CX-90"],
  Jeep:["Grand Cherokee","Wrangler","Cherokee","Compass","Gladiator","Renegade","Wagoneer"],
  Ram:["1500","2500","3500","ProMaster"],
  GMC:["Sierra","Terrain","Acadia","Yukon","Canyon","Hummer EV"],
  Dodge:["Charger","Challenger","Durango","Hornet"],
  Acura:["MDX","RDX","TLX","Integra","ZDX"],
  Infiniti:["QX60","QX50","QX80","Q50"],
  Volvo:["XC90","XC60","XC40","S60","S90","V60","EX30","EX90"],
  Tesla:["Model 3","Model Y","Model S","Model X","Cybertruck"],
  Porsche:["Cayenne","Macan","911","Taycan","Panamera","718"],
  "Land Rover":["Range Rover","Range Rover Sport","Defender","Discovery","Velar"],
  Cadillac:["Escalade","XT5","XT4","CT5","CT4","Lyriq"],
};

const BODY_TYPES  = ["Sedan","SUV","Truck","Coupe","Van","Hatchback","Convertible","Wagon"];
const FUEL_TYPES  = ["Gas","Hybrid","Electric","Diesel"];
const DRIVETRAINS = ["AWD","FWD","RWD","4WD"];
const EXTERIOR_COLORS = ["Black","White","Silver","Gray","Red","Blue","Green","Brown","Gold","Orange","Yellow","Purple"];
const INTERIOR_COLORS = ["Black","Gray","Brown","Beige","White","Red","Blue"];

const BODY_COLORS: Record<string,string> = {
  Sedan:"#3b82f6", SUV:"#10b981", Truck:"#f59e0b", Coupe:"#ef4444",
  Van:"#8b5cf6", Hatchback:"#06b6d4", Convertible:"#ec4899", Wagon:"#84cc16",
};

const SORT_OPTIONS = [
  {value:"price_asc",label:"Price: Low to High"},
  {value:"price_desc",label:"Price: High to Low"},
  {value:"miles_asc",label:"Mileage: Low to High"},
  {value:"dom_asc",label:"Newest Listed"},
  {value:"deal",label:"Best Deal"},
];

// ─── SVG Icons ───────────────────────────────────────────────────

const IC = {
  search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`,
  filter:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  sun:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  spark:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  left:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  right:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  chevDown:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  pin:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  gauge:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  share:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  ext:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  grid:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  bar:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  car:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>`,
  tag:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  store:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  x:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  carSil:`<svg class="car-silhouette" width="120" height="60" viewBox="0 0 120 60" fill="none"><path d="M10 45C10 45 15 25 35 22L50 12C55 8 70 8 80 12L95 22C105 25 110 35 110 45Z" fill="currentColor" opacity="0.15"/><circle cx="30" cy="48" r="8" fill="currentColor" opacity="0.15"/><circle cx="90" cy="48" r="8" fill="currentColor" opacity="0.15"/></svg>`,
};

// ─── Mock Data (20 realistic listings) ───────────────────────────

const MOCK: CarListing[] = [
  {id:"m1",vin:"1HGCV1F34PA000001",heading:"2023 Honda Civic EX",year:2023,make:"Honda",model:"Civic",trim:"EX",body_type:"Sedan",fuel_type:"Gas",drivetrain:"FWD",transmission:"CVT",engine:"2.0L I4",exterior_color:"Sonic Gray Pearl",interior_color:"Black",price:24500,miles:18200,city:"Denver",state:"CO",zip:"80202",dealer_name:"Mile High Honda",vdp_url:"https://example.com/v1",dom:12,first_seen:"2026-03-14",city_mpg:31,highway_mpg:40,doors:4},
  {id:"m2",vin:"5TDZA23C16S000002",heading:"2024 Toyota RAV4 XLE",year:2024,make:"Toyota",model:"RAV4",trim:"XLE",body_type:"SUV",fuel_type:"Gas",drivetrain:"AWD",transmission:"8-Speed Auto",engine:"2.5L I4",exterior_color:"Blueprint",interior_color:"Black",price:33800,miles:8400,city:"Austin",state:"TX",zip:"73301",dealer_name:"Lone Star Toyota",vdp_url:"https://example.com/v2",dom:5,first_seen:"2026-03-21",city_mpg:27,highway_mpg:35,doors:4,is_cpo:true},
  {id:"m3",vin:"1FA6P8CF9L5000003",heading:"2022 Ford Mustang GT",year:2022,make:"Ford",model:"Mustang",trim:"GT",body_type:"Coupe",fuel_type:"Gas",drivetrain:"RWD",transmission:"6-Speed Manual",engine:"5.0L V8",exterior_color:"Race Red",interior_color:"Ebony",price:38900,miles:22100,city:"Phoenix",state:"AZ",zip:"85001",dealer_name:"Camelback Ford",vdp_url:"https://example.com/v3",dom:18,first_seen:"2026-03-08",city_mpg:15,highway_mpg:24,doors:2},
  {id:"m4",vin:"5YJ3E1EA8PF000004",heading:"2023 Tesla Model 3 Long Range",year:2023,make:"Tesla",model:"Model 3",trim:"Long Range",body_type:"Sedan",fuel_type:"Electric",drivetrain:"AWD",transmission:"1-Speed Direct",engine:"Electric Dual Motor",exterior_color:"Pearl White",interior_color:"Black",price:36200,miles:14500,city:"San Francisco",state:"CA",zip:"94102",dealer_name:"EV Motors SF",vdp_url:"https://example.com/v4",dom:8,first_seen:"2026-03-18",city_mpg:138,highway_mpg:126,doors:4,predicted_price:37500},
  {id:"m5",vin:"1C4RJFBG5LC000005",heading:"2021 Jeep Grand Cherokee Laredo",year:2021,make:"Jeep",model:"Grand Cherokee",trim:"Laredo",body_type:"SUV",fuel_type:"Gas",drivetrain:"4WD",transmission:"8-Speed Auto",engine:"3.6L V6",exterior_color:"Diamond Black",interior_color:"Global Black",price:29700,miles:38200,city:"Chicago",state:"IL",zip:"60601",dealer_name:"Windy City Jeep",vdp_url:"https://example.com/v5",dom:25,first_seen:"2026-03-01",city_mpg:19,highway_mpg:26,doors:4,predicted_price:30500},
  {id:"m6",vin:"WBA5R1C56KA000006",heading:"2024 BMW X5 xDrive40i",year:2024,make:"BMW",model:"X5",trim:"xDrive40i",body_type:"SUV",fuel_type:"Gas",drivetrain:"AWD",transmission:"8-Speed Auto",engine:"3.0L I6 Turbo",exterior_color:"Alpine White",interior_color:"Cognac",price:62500,miles:5200,city:"Miami",state:"FL",zip:"33101",dealer_name:"South Beach BMW",vdp_url:"https://example.com/v6",dom:3,first_seen:"2026-03-23",city_mpg:21,highway_mpg:26,doors:4,is_cpo:true},
  {id:"m7",vin:"1GCUYDED5MZ000007",heading:"2023 Chevrolet Silverado LT",year:2023,make:"Chevrolet",model:"Silverado",trim:"LT",body_type:"Truck",fuel_type:"Gas",drivetrain:"4WD",transmission:"10-Speed Auto",engine:"5.3L V8",exterior_color:"Silver Ice",interior_color:"Jet Black",price:44800,miles:16700,city:"Dallas",state:"TX",zip:"75201",dealer_name:"Texas Chevy Center",vdp_url:"https://example.com/v7",dom:14,first_seen:"2026-03-12",city_mpg:16,highway_mpg:22,doors:4},
  {id:"m8",vin:"JTDKN3DU8A5000008",heading:"2024 Toyota Prius LE",year:2024,make:"Toyota",model:"Prius",trim:"LE",body_type:"Hatchback",fuel_type:"Hybrid",drivetrain:"FWD",transmission:"eCVT",engine:"2.0L I4 Hybrid",exterior_color:"Sea Glass Pearl",interior_color:"Light Gray",price:28900,miles:4200,city:"Portland",state:"OR",zip:"97201",dealer_name:"Rose City Toyota",vdp_url:"https://example.com/v8",dom:7,first_seen:"2026-03-19",city_mpg:57,highway_mpg:53,doors:4},
  {id:"m9",vin:"WDDZF4KB8KA000009",heading:"2022 Mercedes-Benz E-Class E 350",year:2022,make:"Mercedes-Benz",model:"E-Class",trim:"E 350",body_type:"Sedan",fuel_type:"Gas",drivetrain:"RWD",transmission:"9-Speed Auto",engine:"2.0L I4 Turbo",exterior_color:"Obsidian Black",interior_color:"Macchiato Beige",price:45300,miles:28500,city:"Atlanta",state:"GA",zip:"30301",dealer_name:"Peachtree Motors",vdp_url:"https://example.com/v9",dom:20,first_seen:"2026-03-06",city_mpg:23,highway_mpg:33,doors:4},
  {id:"m10",vin:"4S3BWAC68P3000010",heading:"2025 Subaru Outback Premium",year:2025,make:"Subaru",model:"Outback",trim:"Premium",body_type:"Wagon",fuel_type:"Gas",drivetrain:"AWD",transmission:"CVT",engine:"2.5L Flat-4",exterior_color:"Autumn Green",interior_color:"Gray",price:34200,miles:2100,city:"Seattle",state:"WA",zip:"98101",dealer_name:"Pacific Subaru",vdp_url:"https://example.com/v10",dom:2,first_seen:"2026-03-24",city_mpg:26,highway_mpg:32,doors:4,predicted_price:35000},
  {id:"m11",vin:"WAUENAF46LN000011",heading:"2023 Audi Q5 Premium Plus",year:2023,make:"Audi",model:"Q5",trim:"Premium Plus",body_type:"SUV",fuel_type:"Gas",drivetrain:"AWD",transmission:"7-Speed DCT",engine:"2.0L I4 Turbo",exterior_color:"Navarra Blue",interior_color:"Okapi Brown",price:46700,miles:12300,city:"Boston",state:"MA",zip:"02101",dealer_name:"Commonwealth Audi",vdp_url:"https://example.com/v11",dom:11,first_seen:"2026-03-15",city_mpg:23,highway_mpg:28,doors:4,is_cpo:true},
  {id:"m12",vin:"5XYPG4A50PG000012",heading:"2024 Kia Telluride SX",year:2024,make:"Kia",model:"Telluride",trim:"SX",body_type:"SUV",fuel_type:"Gas",drivetrain:"AWD",transmission:"8-Speed Auto",engine:"3.8L V6",exterior_color:"Everlasting Silver",interior_color:"Navy",price:48500,miles:6800,city:"Minneapolis",state:"MN",zip:"55401",dealer_name:"North Star Kia",vdp_url:"https://example.com/v12",dom:6,first_seen:"2026-03-20",city_mpg:20,highway_mpg:26,doors:4,predicted_price:49200},
  {id:"m13",vin:"1N4BL4DV4LC000013",heading:"2021 Nissan Altima SR",year:2021,make:"Nissan",model:"Altima",trim:"SR",body_type:"Sedan",fuel_type:"Gas",drivetrain:"FWD",transmission:"CVT",engine:"2.5L I4",exterior_color:"Scarlet Ember",interior_color:"Charcoal",price:21800,miles:42300,city:"Las Vegas",state:"NV",zip:"89101",dealer_name:"Desert Nissan",vdp_url:"https://example.com/v13",dom:30,first_seen:"2026-02-24",city_mpg:28,highway_mpg:39,doors:4},
  {id:"m14",vin:"WP0AB2A71KS000014",heading:"2022 Porsche 911 Carrera S",year:2022,make:"Porsche",model:"911",trim:"Carrera S",body_type:"Coupe",fuel_type:"Gas",drivetrain:"RWD",transmission:"8-Speed PDK",engine:"3.0L Flat-6 TT",exterior_color:"GT Silver",interior_color:"Black/Bordeaux",price:124900,miles:11200,city:"Scottsdale",state:"AZ",zip:"85251",dealer_name:"Desert European",vdp_url:"https://example.com/v14",dom:15,first_seen:"2026-03-11",city_mpg:18,highway_mpg:24,doors:2},
  {id:"m15",vin:"5YJ3E1EB8MF000015",heading:"2025 Tesla Model Y Performance",year:2025,make:"Tesla",model:"Model Y",trim:"Performance",body_type:"SUV",fuel_type:"Electric",drivetrain:"AWD",transmission:"1-Speed Direct",engine:"Electric Dual Motor",exterior_color:"Midnight Cherry Red",interior_color:"White",price:52990,miles:1200,city:"Los Angeles",state:"CA",zip:"90001",dealer_name:"SoCal EV Gallery",vdp_url:"https://example.com/v15",dom:1,first_seen:"2026-03-25",city_mpg:123,highway_mpg:112,doors:4},
  {id:"m16",vin:"1FTFW1E82NF000016",heading:"2022 Ford F-150 XLT",year:2022,make:"Ford",model:"F-150",trim:"XLT",body_type:"Truck",fuel_type:"Gas",drivetrain:"4WD",transmission:"10-Speed Auto",engine:"2.7L V6 EcoBoost",exterior_color:"Antimatter Blue",interior_color:"Medium Dark Slate",price:39500,miles:29800,city:"Nashville",state:"TN",zip:"37201",dealer_name:"Music City Ford",vdp_url:"https://example.com/v16",dom:22,first_seen:"2026-03-04",city_mpg:20,highway_mpg:26,doors:4,predicted_price:40200},
  {id:"m17",vin:"KNAE35LC5N5000017",heading:"2024 Hyundai Ioniq 5 SEL",year:2024,make:"Hyundai",model:"Ioniq 5",trim:"SEL",body_type:"SUV",fuel_type:"Electric",drivetrain:"RWD",transmission:"1-Speed Direct",engine:"Electric Single Motor",exterior_color:"Digital Teal",interior_color:"Dark Pebble Gray",price:41200,miles:7600,city:"Raleigh",state:"NC",zip:"27601",dealer_name:"Triangle Hyundai",vdp_url:"https://example.com/v17",dom:9,first_seen:"2026-03-17",city_mpg:114,highway_mpg:98,doors:4},
  {id:"m18",vin:"5GAEVCKW0MJ000018",heading:"2023 GMC Yukon Denali",year:2023,make:"GMC",model:"Yukon",trim:"Denali",body_type:"SUV",fuel_type:"Gas",drivetrain:"4WD",transmission:"10-Speed Auto",engine:"6.2L V8",exterior_color:"Onyx Black",interior_color:"Teak/Light Shale",price:72500,miles:19400,city:"Houston",state:"TX",zip:"77001",dealer_name:"Gulf Coast GMC",vdp_url:"https://example.com/v18",dom:16,first_seen:"2026-03-10",city_mpg:14,highway_mpg:19,doors:4,is_cpo:true},
  {id:"m19",vin:"SALAG2V64PA000019",heading:"2023 Land Rover Defender 110 S",year:2023,make:"Land Rover",model:"Defender",trim:"110 S",body_type:"SUV",fuel_type:"Gas",drivetrain:"AWD",transmission:"8-Speed Auto",engine:"3.0L I6 Turbo",exterior_color:"Fuji White",interior_color:"Ebony",price:58900,miles:15600,city:"Denver",state:"CO",zip:"80202",dealer_name:"Mountain Range Rover",vdp_url:"https://example.com/v19",dom:13,first_seen:"2026-03-13",city_mpg:18,highway_mpg:21,doors:4,predicted_price:59800},
  {id:"m20",vin:"YV4A22RL6P1000020",heading:"2024 Volvo XC60 B5 Plus",year:2024,make:"Volvo",model:"XC60",trim:"B5 Plus",body_type:"SUV",fuel_type:"Hybrid",drivetrain:"AWD",transmission:"8-Speed Auto",engine:"2.0L I4 Turbo Mild-Hybrid",exterior_color:"Crystal White",interior_color:"Charcoal",price:47800,miles:9100,city:"Philadelphia",state:"PA",zip:"19101",dealer_name:"Main Line Volvo",vdp_url:"https://example.com/v20",dom:10,first_seen:"2026-03-16",city_mpg:26,highway_mpg:33,doors:4,is_cpo:true},
].map(c=>({...c,photo_urls:[],options:["Bluetooth","Backup Camera","Keyless Entry","Alloy Wheels"],features:["Apple CarPlay","Android Auto"],seller_comments:"",cylinders:4,engine_size:"2.0L",msrp:0} as CarListing));

// ─── Auth & Mode Detection ──────────────────────────────────────

function _getAuth(): { mode: "api_key" | "oauth_token" | null; value: string | null } {
  const params = new URLSearchParams(location.search);
  const token = params.get("access_token") ?? localStorage.getItem("mc_access_token");
  if (token) return { mode: "oauth_token", value: token };
  const key = params.get("api_key") ?? localStorage.getItem("mc_api_key");
  if (key) return { mode: "api_key", value: key };
  return { mode: null, value: null };
}

function _detectAppMode(): "mcp" | "live" | "demo" {
  if (_getAuth().value) return "live";
  if (window.parent !== window) return "mcp";
  return "demo";
}

// ─── Application State ──────────────────────────────────────────

const S = {
  view: "search" as "search"|"details"|"nlp",
  detailIdx: -1,
  dark: localStorage.getItem("mc_dark") === "1",
  listings: [...MOCK] as CarListing[],
  total: MOCK.length,
  page: 0,
  loading: false,
  drawerOpen: false,
  statsOpen: false,
  mock: true,
  filters: { rows: 24, start: 0 } as SearchFilters,
  _lastNlp: "" as string,
  _detailPhotoIdx: 0,
  _nlpWarning: "" as string,
};

// ─── API Layer ───────────────────────────────────────────────────

function apiKey(): string|null {
  return _getAuth().value;
}

async function apiSearch(args: Record<string,any>): Promise<any> {
  const k = apiKey();
  if (!k) return null;
  // Direct API call to MarketCheck (no proxy)
  try {
    const url = new URL("https://api.marketcheck.com/v2/search/car/active");
    url.searchParams.set("api_key", k);
    const directArgs = {...args, stats:"price,miles", facets:"make,model,trim,body_type", include_dealer_object:true, include_build_object:true, fetch_all_photos:true};
    for (const [key, val] of Object.entries(directArgs)) {
      if (val !== undefined && val !== null && val !== "") url.searchParams.set(key, String(val));
    }
    const r = await fetch(url.toString());
    if (r.ok) return r.json();
  } catch(e) { console.error("Direct API error, trying proxy:", e); }
  // Proxy fallback
  try {
    const r = await fetch("/api/proxy/search-cars", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({...args, _auth_mode:"api_key", _auth_value:k}),
    });
    if (r.ok) return r.json();
  } catch(e) { console.error("Proxy error:",e); }
  return null;
}

function buildParams(): Record<string,any> {
  const f = S.filters, p: Record<string,any> = {};
  if (f.make) p.make = f.make;
  if (f.model) p.model = f.model;
  if (f.year_range) p.year = f.year_range;
  if (f.price_range) p.price_range = f.price_range;
  if (f.miles_range) p.miles_range = f.miles_range;
  if (f.body_type) p.body_type = f.body_type;
  if (f.fuel_type) p.fuel_type = f.fuel_type;
  if (f.drivetrain) p.drivetrain = f.drivetrain;
  if (f.exterior_color) p.exterior_color = f.exterior_color;
  if (f.interior_color) p.interior_color = f.interior_color;
  if (f.zip) p.zip = f.zip;
  if (f.radius) p.radius = f.radius;
  if (f.sort_by) {
    const sortMap: Record<string, { by: string; order: string }> = {
      price_asc:  { by: "price", order: "asc" },
      price_desc: { by: "price", order: "desc" },
      miles_asc:  { by: "miles", order: "asc" },
      dom_asc:    { by: "dom", order: "asc" },
      deal:       { by: "price", order: "asc" },
    };
    const s = sortMap[f.sort_by] ?? { by: "price", order: "asc" };
    p.sort_by = s.by;
    p.sort_order = s.order;
  }
  p.rows = f.rows; p.start = f.start;
  return p;
}

function mapItem(i: any): CarListing {
  // MarketCheck API nests vehicle specs under `build` object; also check flat fields as fallback
  const b = i.build || {};
  const photos: string[] = i.media?.photo_links || [];
  // Options/features may come as arrays or comma-separated strings
  const parseList = (v: any): string[] => {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === "string" && v) return v.split(",").map((s: string) => s.trim()).filter(Boolean);
    return [];
  };
  return {
    id:i.id||i.vin||Math.random().toString(36).slice(2),
    vin:i.vin||"", heading:i.heading||`${i.year} ${i.make} ${i.model} ${i.trim||""}`.trim(),
    year:i.year||0, make:i.make||"", model:i.model||"", trim:i.trim||"",
    body_type:i.body_type||b.body_type||"",
    fuel_type:i.fuel_type||b.fuel_type||"",
    drivetrain:i.drivetrain||b.drivetrain||"",
    transmission:i.transmission||b.transmission||"",
    engine:i.engine||b.engine||b.engine_type||[b.engine_size, b.engine_block, b.engine_aspiration].filter(Boolean).join(" ")||"",
    exterior_color:i.exterior_color||b.exterior_color||"",
    interior_color:i.interior_color||b.interior_color||"",
    price:i.price||0,
    miles:i.miles||i.ref_miles||i.mileage||0,
    city:i.city||i.dealer?.city||i.location?.city||"",
    state:i.state||i.dealer?.state||i.location?.state||"",
    zip:i.zip||i.dealer?.zip||i.location?.zip||"",
    dealer_name:i.dealer_name||i.dealer?.name||"",
    vdp_url:i.vdp_url||"",
    dom:i.dom||i.days_on_market||i.dom_180||i.dom_active||0,
    first_seen:i.first_seen_date||i.first_seen||i.first_seen_at_source||i.first_seen_at||"",
    city_mpg:i.city_mpg||b.city_mpg||0,
    highway_mpg:i.highway_mpg||b.highway_mpg||0,
    doors:i.doors||b.doors||0,
    predicted_price:i.predicted_price||undefined,
    is_cpo:i.is_cpo||i.is_certified||false,
    photo_url:photos[0]||i.photo_url||undefined,
    photo_urls:photos,
    options:parseList(i.options_packages||i.options||b.standard_specs),
    features:parseList(i.high_value_features||i.features||b.made_in),
    seller_comments:i.seller_comments||i.description||i.dealer_comment||"",
    cylinders:i.cylinders||b.cylinders||0,
    engine_size:i.engine_size||b.engine_size||"",
    msrp:i.msrp||b.msrp||0,
  };
}

async function doSearch(reset = true) {
  if (reset) { S.filters.start = 0; S.page = 0; }
  S.loading = true; draw();

  const res = await apiSearch(buildParams());
  if (res?.listings?.length) {
    S.mock = false;
    const mapped = res.listings.map(mapItem);
    S.listings = reset ? mapped : [...S.listings, ...mapped];
    S.total = res.num_found || mapped.length;
  } else if (reset) {
    S.mock = true;
    S.listings = filterLocal();
    S.total = S.listings.length;
  }
  S.loading = false;
  if (S.view !== "search") { S.view = "search"; setHash(); }
  draw();
}

function filterLocal(): CarListing[] {
  const f = S.filters;
  let d = [...MOCK];
  if (f.make) d = d.filter(c => c.make.toLowerCase() === f.make!.toLowerCase());
  if (f.model) d = d.filter(c => c.model.toLowerCase() === f.model!.toLowerCase());
  if (f.year_range) {
    const [a,b] = f.year_range.split("-").map(Number);
    if (a) d = d.filter(c => c.year >= a);
    if (b) d = d.filter(c => c.year <= b);
  }
  if (f.price_range) {
    const [a,b] = f.price_range.split("-").map(Number);
    if (a) d = d.filter(c => c.price >= a);
    if (b) d = d.filter(c => c.price <= b);
  }
  if (f.miles_range) {
    const mx = parseInt(f.miles_range.replace("-","").replace(/,/g,""));
    if (mx) d = d.filter(c => c.miles <= mx);
  }
  if (f.body_type) { const ts = f.body_type.split(",").map(t=>t.toLowerCase()); d = d.filter(c=>ts.includes(c.body_type.toLowerCase())); }
  if (f.fuel_type) { const ts = f.fuel_type.split(",").map(t=>t.toLowerCase()); d = d.filter(c=>ts.includes(c.fuel_type.toLowerCase())); }
  if (f.drivetrain) { const ts = f.drivetrain.split(",").map(t=>t.toLowerCase()); d = d.filter(c=>ts.includes(c.drivetrain.toLowerCase())); }
  if (f.exterior_color) { const ts = f.exterior_color.split(",").map(t=>t.toLowerCase()); d = d.filter(c=>ts.some(t=>c.exterior_color.toLowerCase().includes(t))); }
  if (f.interior_color) { const ts = f.interior_color.split(",").map(t=>t.toLowerCase()); d = d.filter(c=>ts.some(t=>c.interior_color.toLowerCase().includes(t))); }
  if (f.sort_by) {
    switch(f.sort_by) {
      case "price_asc":  d.sort((a,b)=>a.price-b.price); break;
      case "price_desc": d.sort((a,b)=>b.price-a.price); break;
      case "miles_asc":  d.sort((a,b)=>a.miles-b.miles); break;
      case "dom_asc":    d.sort((a,b)=>a.dom-b.dom); break;
      case "deal":       d.sort((a,b)=>{
        const sa=a.predicted_price?(a.predicted_price-a.price)/a.predicted_price:0;
        const sb=b.predicted_price?(b.predicted_price-b.price)/b.predicted_price:0;
        return sb-sa;
      }); break;
    }
  }
  return d;
}

// ─── NLP Parser ──────────────────────────────────────────────────

function parseNlp(q: string): Partial<SearchFilters> {
  const s = q.toLowerCase();
  const p: Partial<SearchFilters> = {};

  for (const mk of TOP_MAKES) {
    if (s.includes(mk.toLowerCase())) {
      p.make = mk;
      for (const md of (MODELS_BY_MAKE[mk]||[])) {
        if (s.includes(md.toLowerCase())) { p.model = md; break; }
      }
      break;
    }
  }

  const pu = s.match(/(?:under|below|less than|up to|max|budget)\s*\$?\s*([\d,]+)/);
  const po = s.match(/(?:over|above|more than|at least|min|starting)\s*\$?\s*([\d,]+)/);
  const pb = s.match(/between\s*\$?\s*([\d,]+)\s*(?:and|-)\s*\$?\s*([\d,]+)/);
  if (pb) p.price_range = `${parseInt(pb[1].replace(/,/g,""))}-${parseInt(pb[2].replace(/,/g,""))}`;
  else if (pu && po) p.price_range = `${parseInt(po[1].replace(/,/g,""))}-${parseInt(pu[1].replace(/,/g,""))}`;
  else if (pu) p.price_range = `0-${parseInt(pu[1].replace(/,/g,""))}`;
  else if (po) p.price_range = `${parseInt(po[1].replace(/,/g,""))}-`;

  const mu = s.match(/(?:under|below|less than|fewer than)\s*([\d,]+)\s*(?:miles|mi)/);
  if (mu) p.miles_range = `0-${parseInt(mu[1].replace(/,/g,""))}`;

  const yn = s.match(/(20\d{2})\s*(?:or\s*)?newer/);
  const ya = s.match(/(?:newer|after|since)\s*(?:than\s*)?(20\d{2})/);
  const ye = s.match(/\b(20[1-2]\d)\b/);
  if (yn) p.year_range = `${yn[1]}-2026`;
  else if (ya) p.year_range = `${ya[1]}-2026`;
  else if (ye) p.year_range = `${ye[1]}-${ye[1]}`;

  const bm: Record<string,string> = {sedan:"Sedan",suv:"SUV",truck:"Truck",pickup:"Truck",coupe:"Coupe",van:"Van",minivan:"Van",hatchback:"Hatchback",convertible:"Convertible",wagon:"Wagon",crossover:"SUV"};
  for (const [kw,bt] of Object.entries(bm)) { if (s.includes(kw)) { p.body_type = bt; break; } }

  if (s.includes("electric")||s.includes(" ev ")||s.match(/\bev\b/)) p.fuel_type = "Electric";
  else if (s.includes("hybrid")||s.includes("phev")) p.fuel_type = "Hybrid";
  else if (s.includes("diesel")) p.fuel_type = "Diesel";

  if (s.includes("awd")||s.includes("all-wheel")||s.includes("all wheel")) p.drivetrain = "AWD";
  else if (s.includes("4wd")||s.includes("four wheel")||s.includes("4x4")) p.drivetrain = "4WD";
  else if (s.includes("fwd")||s.includes("front-wheel")) p.drivetrain = "FWD";
  else if (s.includes("rwd")||s.includes("rear-wheel")) p.drivetrain = "RWD";

  // Color detection — check for "red interior", "black exterior", or just color names (default to exterior)
  const colorNames = ["black","white","silver","gray","grey","red","blue","green","brown","gold","orange","yellow","purple","beige"];
  const intMatch = s.match(new RegExp(`(${colorNames.join("|")})\\s+interior`));
  const extMatch = s.match(new RegExp(`(${colorNames.join("|")})\\s+(?:exterior|paint|color)`));
  // Also check for standalone "red car", "blue SUV" etc. or just a color keyword
  if (intMatch) p.interior_color = intMatch[1].charAt(0).toUpperCase() + intMatch[1].slice(1);
  if (extMatch) p.exterior_color = extMatch[1].charAt(0).toUpperCase() + extMatch[1].slice(1);
  // If neither explicit pattern matched, look for color words not already captured
  if (!intMatch && !extMatch) {
    for (const c of colorNames) {
      if (s.includes(c)) {
        const normalized = c === "grey" ? "Gray" : c.charAt(0).toUpperCase() + c.slice(1);
        p.exterior_color = normalized;
        break;
      }
    }
  }

  const zm = s.match(/(?:near|in|around)\s+(\d{5})/);
  if (zm) { p.zip = zm[1]; p.radius = "50"; }

  return p;
}

// ─── Helpers ─────────────────────────────────────────────────────

const fmt  = (n: number) => n.toLocaleString("en-US");
const fmtP = (n: number) => "$"+n.toLocaleString("en-US");
const fmtM = (p: number) => `Est. $${fmt(Math.round(p/60))}/mo`;
const esc  = (s: string) => { const d=document.createElement("div"); d.textContent=s; return d.innerHTML; };
const bCol = (t: string) => BODY_COLORS[t] || "#6b7280";

function badges(c: CarListing): {t:string,c:string}[] {
  const b: {t:string,c:string}[] = [];
  if (c.predicted_price && c.price < c.predicted_price*0.95) b.push({t:"Great Deal",c:"#16a34a"});
  if (c.is_cpo) b.push({t:"CPO",c:"#2563eb"});
  if (c.miles > 0 && c.miles < 15000) b.push({t:"Low Miles",c:"#7c3aed"});
  if (c.dom <= 3) b.push({t:"New Arrival",c:"#ea580c"});
  return b;
}

function activeTags(): {key:string,label:string}[] {
  const f = S.filters, t: {key:string,label:string}[] = [];
  if (f.make) t.push({key:"make",label:f.make});
  if (f.model) t.push({key:"model",label:f.model});
  if (f.year_range) t.push({key:"year_range",label:`Year: ${f.year_range}`});
  if (f.price_range) {
    const [a,b] = f.price_range.split("-");
    let l = "Price: ";
    if (a && a!=="0") l += fmtP(parseInt(a));
    if (a && b) l += " - ";
    if (b) l += fmtP(parseInt(b));
    t.push({key:"price_range",label:l});
  }
  if (f.miles_range) { const m=f.miles_range.replace("0-",""); t.push({key:"miles_range",label:`Max ${fmt(parseInt(m))} mi`}); }
  if (f.body_type)  t.push({key:"body_type",label:f.body_type});
  if (f.fuel_type)  t.push({key:"fuel_type",label:f.fuel_type});
  if (f.drivetrain) t.push({key:"drivetrain",label:f.drivetrain});
  if (f.exterior_color) t.push({key:"exterior_color",label:`Ext: ${f.exterior_color}`});
  if (f.interior_color) t.push({key:"interior_color",label:`Int: ${f.interior_color}`});
  if (f.zip) t.push({key:"zip",label:`ZIP: ${f.zip} (${f.radius||50}mi)`});
  return t;
}

function stats() {
  if (!S.listings.length) return null;
  const ps = S.listings.map(c=>c.price).filter(p=>p>0);
  const ms = S.listings.map(c=>c.miles).filter(m=>m>0);
  const bd: Record<string,number> = {};
  S.listings.forEach(c => { const k=c.body_type||"Other"; bd[k]=(bd[k]||0)+1; });
  return {
    pMin:Math.min(...ps), pMax:Math.max(...ps),
    pAvg:Math.round(ps.reduce((a,b)=>a+b,0)/ps.length),
    mAvg:Math.round(ms.reduce((a,b)=>a+b,0)/ms.length),
    bd,
  };
}

function comps(car: CarListing) {
  // Use live listings first, fall back to MOCK for demo mode
  const pool = S.listings.length > 1 ? S.listings : MOCK;
  return pool.filter(c => c.id !== car.id && (c.make === car.make || c.body_type === car.body_type)).slice(0,5);
}

// ─── Routing ─────────────────────────────────────────────────────

function setHash() {
  if (S.view === "details") location.hash = `#/vehicle/${S.detailIdx}`;
  else if (S.view === "nlp") location.hash = "#/nlp";
  else location.hash = "#/search";
}

function onHash() {
  const h = location.hash || "#/search";
  if (h.startsWith("#/vehicle/")) {
    const i = parseInt(h.replace("#/vehicle/",""));
    if (!isNaN(i) && i >= 0 && i < S.listings.length) { S.view = "details"; S.detailIdx = i; }
    else S.view = "search";
  } else if (h === "#/nlp") S.view = "nlp";
  else S.view = "search";
  draw();
}

// ─── CSS ─────────────────────────────────────────────────────────

function css(): string { return `
:root{--bg1:#f8fafc;--bg2:#ffffff;--bg3:#f1f5f9;--bgH:#e2e8f0;--t1:#0f172a;--t2:#475569;--tm:#94a3b8;--bc:#e2e8f0;--bl:#f1f5f9;--ac:#2563eb;--acH:#1d4ed8;--acL:#dbeafe;--ok:#16a34a;--wa:#f59e0b;--er:#ef4444;--ss:0 1px 2px rgba(0,0,0,.04);--sm:0 4px 12px rgba(0,0,0,.06);--sl:0 8px 24px rgba(0,0,0,.08);--sx:0 12px 40px rgba(0,0,0,.1);--rs:6px;--rm:10px;--rl:14px;--rx:18px;--tr:.2s ease;--ff:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Roboto,sans-serif}
[data-theme="dark"]{--bg1:#0f172a;--bg2:#1e293b;--bg3:#334155;--bgH:#475569;--t1:#f1f5f9;--t2:#cbd5e1;--tm:#64748b;--bc:#334155;--bl:#1e293b;--ac:#3b82f6;--acH:#2563eb;--acL:#1e3a5f;--ss:0 1px 2px rgba(0,0,0,.2);--sm:0 4px 12px rgba(0,0,0,.3);--sl:0 8px 24px rgba(0,0,0,.35);--sx:0 12px 40px rgba(0,0,0,.4)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{font-family:var(--ff);background:var(--bg1);color:var(--t1);line-height:1.5;min-height:100vh;-webkit-font-smoothing:antialiased}
#app{min-height:100vh;display:flex;flex-direction:column}

/* header */
.hdr{background:var(--bg2);border-bottom:1px solid var(--bc);padding:0 20px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:var(--ss)}
.hdr-l{display:flex;align-items:center;gap:12px}
.hdr-l img{width:36px;height:36px;border-radius:8px;object-fit:contain}
.hdr-l span{font-size:20px;font-weight:700;letter-spacing:-.3px}
.hdr-r{display:flex;align-items:center;gap:8px}
.hb{display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:var(--rs);border:1px solid var(--bc);background:var(--bg2);color:var(--t2);font-size:13px;font-weight:500;cursor:pointer;transition:all var(--tr);min-height:38px}
.hb:hover{background:var(--bgH);color:var(--t1)}.hb.on{background:var(--ac);color:#fff;border-color:var(--ac)}
.hb svg{width:16px;height:16px;flex-shrink:0}
.aki{display:flex;align-items:center;gap:6px}
.aki input{padding:7px 10px;border:1px solid var(--bc);border-radius:var(--rs);background:var(--bg3);color:var(--t1);font-size:12px;width:140px;outline:none;transition:border-color var(--tr)}
.aki input:focus{border-color:var(--ac)}.aki input::placeholder{color:var(--tm)}

/* layout */
.lay{display:flex;flex:1;min-height:0}

/* sidebar */
.sb{width:300px;background:var(--bg2);border-right:1px solid var(--bc);overflow-y:auto;flex-shrink:0;padding:20px;display:flex;flex-direction:column;gap:18px}
.fs h3{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--tm);margin-bottom:8px}
.fsel{width:100%;padding:9px 12px;border:1px solid var(--bc);border-radius:var(--rs);background:var(--bg1);color:var(--t1);font-size:14px;cursor:pointer;outline:none;transition:border-color var(--tr);appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
.fsel:focus{border-color:var(--ac)}
.fr{display:flex;gap:8px}.fr>*{flex:1}
.fin{width:100%;padding:9px 12px;border:1px solid var(--bc);border-radius:var(--rs);background:var(--bg1);color:var(--t1);font-size:14px;outline:none;transition:border-color var(--tr)}
.fin:focus{border-color:var(--ac)}.fin::placeholder{color:var(--tm)}
.cg{display:flex;flex-wrap:wrap;gap:6px}
.ch{padding:6px 12px;border-radius:20px;border:1px solid var(--bc);background:var(--bg1);color:var(--t2);font-size:12px;font-weight:500;cursor:pointer;transition:all var(--tr);user-select:none}
.ch:hover{border-color:var(--ac);color:var(--ac)}
.ch.on{background:var(--acL);border-color:var(--ac);color:var(--ac);font-weight:600}
.fa{display:flex;gap:10px;padding-top:10px;position:sticky;bottom:0;background:var(--bg2);z-index:5;padding-bottom:6px;border-top:1px solid var(--bc);margin-top:8px}
.bsrch{flex:1;padding:11px 20px;background:var(--ac);color:#fff;border:none;border-radius:var(--rs);font-size:14px;font-weight:600;cursor:pointer;transition:background var(--tr);min-height:44px}
.bsrch:hover{background:var(--acH)}
.brst{padding:11px 16px;background:transparent;color:var(--tm);border:1px solid var(--bc);border-radius:var(--rs);font-size:13px;cursor:pointer;transition:all var(--tr);min-height:44px}
.brst:hover{color:var(--er);border-color:var(--er)}

/* stats */
.stp{background:var(--bg3);border-radius:var(--rm);padding:14px}
.stt{display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:var(--t2);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.stt svg{width:14px;height:14px;transition:transform var(--tr)}.stt.op svg{transform:rotate(180deg)}
.stb{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.str{display:flex;justify-content:space-between;font-size:13px}
.stl{color:var(--tm)}.stv{color:var(--t1);font-weight:600}
.bch{display:flex;flex-direction:column;gap:4px;margin-top:4px}
.brw{display:flex;align-items:center;gap:8px;font-size:11px}
.brl{width:70px;color:var(--tm);text-align:right;flex-shrink:0}
.brt{flex:1;height:14px;background:var(--bgH);border-radius:7px;overflow:hidden}
.brf{height:100%;border-radius:7px;transition:width .5s ease}
.brc{width:24px;color:var(--t2);font-weight:600}

/* main */
.mn{flex:1;min-width:0;padding:20px;overflow-y:auto}

/* result bar */
.rb{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px}
.rc{font-size:15px;font-weight:600}.rc b{color:var(--ac)}
.mb{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:var(--wa);color:#000;border-radius:12px;font-size:11px;font-weight:600;margin-left:8px}
.fts{display:flex;flex-wrap:wrap;gap:6px}
.ft{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--acL);color:var(--ac);border-radius:14px;font-size:12px;font-weight:500}
.ftx{cursor:pointer;display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--ac);color:#fff;font-size:10px;font-weight:700;line-height:1;transition:opacity var(--tr)}.ftx:hover{opacity:.8}

/* card grid */
.cg2{display:grid;grid-template-columns:1fr;gap:16px}
@media(min-width:640px){.cg2{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1024px){.cg2{grid-template-columns:repeat(3,1fr)}}
.cd{background:var(--bg2);border:1px solid var(--bc);border-radius:var(--rl);overflow:hidden;transition:all var(--tr);cursor:pointer;position:relative}
.cd:hover{box-shadow:var(--sl);transform:translateY(-2px);border-color:var(--ac)}
.cp{width:100%;height:180px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.cp img{width:100%;height:100%;object-fit:cover}
.cpp{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
.cpm{font-size:22px;font-weight:800;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:2px}
.cbs{position:absolute;top:10px;left:10px;display:flex;gap:4px;flex-wrap:wrap}
.bdg{padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.3px}
.cdm{position:absolute;bottom:8px;right:10px;font-size:11px;color:var(--t1);background:var(--bg1);padding:3px 8px;border-radius:10px;font-weight:600;border:1px solid var(--bc);opacity:0.95}
.cby{padding:14px 16px 16px}
.ctt{font-size:16px;font-weight:700;color:var(--t1);margin-bottom:4px;line-height:1.3}
.cpr{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
.cpv{font-size:22px;font-weight:800;color:var(--t1)}
.ces{font-size:12px;color:var(--tm)}
.cme{display:flex;align-items:center;gap:14px;margin-bottom:8px;font-size:13px;color:var(--t2)}
.cmi{display:flex;align-items:center;gap:4px}.cmi svg{width:14px;height:14px;color:var(--tm)}
.csp{font-size:12px;color:var(--tm);margin-bottom:12px;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.csp .sp{color:var(--bc)}
.cbn{width:100%;padding:10px;background:var(--bg3);color:var(--ac);border:none;border-radius:var(--rs);font-size:13px;font-weight:600;cursor:pointer;transition:all var(--tr)}
.cbn:hover{background:var(--ac);color:#fff}

/* loading */
.ld{display:flex;align-items:center;justify-content:center;padding:60px 20px;flex-direction:column;gap:16px}
.spin{width:40px;height:40px;border:3px solid var(--bc);border-top-color:var(--ac);border-radius:50%;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.ldt{font-size:14px;color:var(--tm)}

/* load more */
.lmc{text-align:center;padding:30px 0}
.blm{padding:12px 36px;background:var(--bg2);color:var(--ac);border:2px solid var(--ac);border-radius:var(--rm);font-size:14px;font-weight:600;cursor:pointer;transition:all var(--tr);min-height:44px}
.blm:hover{background:var(--ac);color:#fff}

/* detail */
.dv-wrap{max-width:1200px;margin:0 auto;padding:20px}.dv-inner{max-width:70%;margin:0 auto}
.carousel-wrap{width:100%}.carousel-main{width:100%;height:400px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;background:var(--bg3)}.carousel-main img{max-width:100%;max-height:100%;object-fit:contain}.car-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:#fff;border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;transition:background 0.2s}.car-nav:hover{background:rgba(0,0,0,0.8)}.car-nav svg{width:20px;height:20px}.car-prev{left:12px}.car-next{right:12px}.car-count{position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.6);color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600}
.carousel-thumbs{display:flex;gap:6px;padding:10px;overflow-x:auto;background:var(--bg2)}.car-thumb{width:64px;height:48px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid transparent;opacity:0.6;transition:all 0.2s}.car-thumb:hover{opacity:1}.car-thumb.active{border-color:var(--ac);opacity:1}
.opt-grid{display:flex;flex-wrap:wrap;gap:8px}.opt-tag{padding:6px 12px;background:var(--bg3);border:1px solid var(--bc);border-radius:20px;font-size:13px;color:var(--t2)}.feat-tag{padding:6px 12px;background:var(--ac)15;border:1px solid var(--ac)33;border-radius:20px;font-size:13px;color:var(--ac);font-weight:500}
.seller-comments{font-size:14px;line-height:1.7;color:var(--t2);max-height:300px;overflow-y:auto;padding:12px;background:var(--bg3);border-radius:var(--rs);border:1px solid var(--bc)}
.dv{max-width:960px;margin:0 auto;padding:20px}
.bbk{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;background:var(--bg2);color:var(--t2);border:1px solid var(--bc);border-radius:var(--rs);font-size:13px;font-weight:500;cursor:pointer;transition:all var(--tr);margin-bottom:20px;min-height:44px}
.bbk:hover{color:var(--ac);border-color:var(--ac)}.bbk svg{width:16px;height:16px}
.dh{background:var(--bg2);border:1px solid var(--bc);border-radius:var(--rx);overflow:hidden;margin-bottom:20px}
.dp{width:100%;height:300px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.dp img{width:100%;height:100%;object-fit:cover}
.dpp{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.dpm{font-size:36px;font-weight:800;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:4px}
.dhb{padding:24px}
.dtt{font-size:28px;font-weight:800;margin-bottom:8px;line-height:1.2}
.dprr{display:flex;align-items:baseline;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.dpv{font-size:36px;font-weight:800}
.des{font-size:15px;color:var(--tm)}
.dbs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.db{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:700;color:#fff;text-transform:uppercase}
.dlc{display:flex;align-items:center;gap:6px;color:var(--t2);font-size:14px}.dlc svg{width:16px;height:16px;color:var(--tm)}

.ds{background:var(--bg2);border:1px solid var(--bc);border-radius:var(--rl);padding:24px;margin-bottom:20px}
.dst{font-size:18px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}.dst svg{width:20px;height:20px;color:var(--ac)}

.sg{display:grid;grid-template-columns:1fr;gap:12px}
@media(min-width:640px){.sg{grid-template-columns:1fr 1fr}}
.si{display:flex;justify-content:space-between;padding:10px 14px;background:var(--bg3);border-radius:var(--rs)}
.sil{font-size:13px;color:var(--tm)}.siv{font-size:13px;font-weight:600;text-align:right}

.pa{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.pbc{flex:1;min-width:200px}
.pbt{height:10px;background:linear-gradient(90deg,#16a34a,#f59e0b,#ef4444);border-radius:5px;position:relative;margin:12px 0}
.pbm{position:absolute;top:-6px;width:22px;height:22px;background:var(--bg2);border:3px solid var(--ac);border-radius:50%;transform:translateX(-50%);box-shadow:var(--sm)}
.pbl{display:flex;justify-content:space-between;font-size:12px;color:var(--tm)}
.pav{display:flex;flex-direction:column;gap:6px}
.par{display:flex;justify-content:space-between;gap:20px;font-size:13px}

.cpl{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.cpi{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg3);border-radius:var(--rs);cursor:pointer;transition:background var(--tr)}
.cpi:hover{background:var(--bgH)}
.cpn{font-size:13px;font-weight:600}.cpd{font-size:12px;color:var(--tm)}.cppr{font-size:14px;font-weight:700}

.dlr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.dli h4{font-size:16px;font-weight:700}.dli p{font-size:13px;color:var(--tm)}
.bds{padding:10px 20px;background:var(--ac);color:#fff;border:none;border-radius:var(--rs);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;transition:background var(--tr);min-height:44px;display:inline-flex;align-items:center;gap:6px}.bds svg{width:16px;height:16px;flex-shrink:0}
.bds:hover{background:var(--acH)}

.das{display:flex;gap:10px;flex-wrap:wrap}
.ba{flex:1;min-width:150px;padding:12px 20px;border-radius:var(--rs);font-size:14px;font-weight:600;cursor:pointer;transition:all var(--tr);border:1px solid var(--bc);background:var(--bg2);color:var(--t2);text-align:center;min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px}.ba svg{width:18px;height:18px;flex-shrink:0}
.ba:hover{border-color:var(--ac);color:var(--ac)}
.ba.pri{background:var(--ac);color:#fff;border-color:var(--ac)}.ba.pri:hover{background:var(--acH)}

/* NLP */
.nv{max-width:720px;margin:0 auto;padding:40px 20px}
.nh{text-align:center;margin-bottom:32px}
.ni{width:64px;height:64px;background:var(--acL);color:var(--ac);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}.ni svg{width:28px;height:28px}
.ntl{font-size:28px;font-weight:800;margin-bottom:8px}
.nst{font-size:15px;color:var(--tm)}
.nig{position:relative;margin-bottom:24px}
.nta{width:100%;padding:18px 20px;padding-right:60px;border:2px solid var(--bc);border-radius:var(--rl);background:var(--bg2);color:var(--t1);font-size:16px;line-height:1.5;outline:none;resize:none;height:80px;font-family:var(--ff);transition:border-color var(--tr)}
.nta:focus{border-color:var(--ac)}.nta::placeholder{color:var(--tm)}
.nsb{position:absolute;right:12px;bottom:12px;width:44px;height:44px;background:var(--ac);color:#fff;border:none;border-radius:var(--rs);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background var(--tr)}.nsb:hover{background:var(--acH)}.nsb svg{width:20px;height:20px}
.nex{display:flex;flex-direction:column;gap:8px}
.nex h4{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--tm);margin-bottom:4px}
.ne{padding:12px 16px;background:var(--bg2);border:1px solid var(--bc);border-radius:var(--rm);font-size:14px;color:var(--t2);cursor:pointer;transition:all var(--tr)}
.ne:hover{border-color:var(--ac);color:var(--ac);background:var(--acL)}
.nps{margin-top:20px;padding:16px;background:var(--bg3);border-radius:var(--rm);font-size:13px}
.nps h4{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--tm);margin-bottom:8px}
.npt{display:flex;flex-wrap:wrap;gap:6px}
.np{padding:4px 10px;background:var(--acL);color:var(--ac);border-radius:12px;font-size:12px;font-weight:500}

/* mobile */
.mstats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;padding:12px 16px;background:var(--bg2);border:1px solid var(--bc);border-radius:var(--rs)}.mst{flex:1;min-width:100px;text-align:center}.msl{display:block;font-size:11px;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}.msv{font-size:15px;font-weight:700;color:var(--t1)}
.nlp-bar{margin-bottom:14px}.nlp-wrap{display:flex;gap:8px}.nlp-input{flex:1;padding:10px 14px;border:1px solid var(--bc);border-radius:var(--rs);background:var(--bg2);color:var(--t1);font-size:14px;outline:none;transition:border-color var(--tr)}.nlp-input:focus{border-color:var(--ac)}.nlp-input::placeholder{color:var(--tm)}.nlp-go{padding:10px 14px;background:var(--ac);color:#fff;border:none;border-radius:var(--rs);cursor:pointer;display:flex;align-items:center}.nlp-go svg{width:18px;height:18px}.nlp-go:hover{background:var(--acH)}
.mft{display:none;padding:10px 16px;background:var(--bg2);border:1px solid var(--bc);border-radius:var(--rs);color:var(--t2);font-size:13px;font-weight:600;cursor:pointer;width:100%;text-align:center;margin-bottom:16px;min-height:44px;align-items:center;justify-content:center;gap:6px}.mft svg{width:16px;height:16px}
.fov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200}.fov.vis{display:block}
.fdw{position:fixed;top:0;left:-320px;width:300px;height:100%;background:var(--bg2);z-index:201;overflow-y:auto;transition:left .3s ease;padding:20px;display:flex;flex-direction:column;gap:18px}.fdw.op{left:0}
.fdh{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--bc)}
.fdh h3{font-size:16px;font-weight:700}
.fdc{width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--bg3);border:none;border-radius:var(--rs);color:var(--t2);cursor:pointer;font-size:18px}

/* empty */
.emp{text-align:center;padding:60px 20px}
.emp svg{width:64px;height:64px;color:var(--tm);margin-bottom:16px}
.emp h3{font-size:20px;font-weight:700;margin-bottom:8px}
.emp p{font-size:14px;color:var(--tm)}

@media(max-width:768px){
  .hdr-l span{font-size:16px}.aki{display:none}
  .sb{display:none}.mft{display:flex}
  .dtt{font-size:22px}.dpv{font-size:28px}.dp{height:220px}
  .dv-inner{max-width:100%!important}
  .carousel-main{height:260px}
  .car-thumb{width:50px;height:38px}
}
@media(min-width:769px){.fov,.fdw{display:none!important}}
.fi{animation:fi .3s ease}@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bc);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:var(--tm)}
`; }

// ─── Render Helpers ──────────────────────────────────────────────

function hFilters(drawer=false): string {
  const f = S.filters;
  const models = f.make ? (MODELS_BY_MAKE[f.make]||[]) : [];
  const years: number[] = []; for (let y=2026;y>=2015;y--) years.push(y);
  const px = drawer ? "d-" : "";

  const chips = (items: string[], key: keyof SearchFilters) => {
    const sel = ((f[key] as string)||"").split(",").filter(Boolean);
    return items.map(v => `<button class="ch ${sel.includes(v)?"on":""}" data-ck="${key}" data-cv="${v}">${v}</button>`).join("");
  };

  const yrParts = (f.year_range||"").split("-");
  const prParts = (f.price_range||"").split("-");

  return `
    ${drawer?`<div class="fdh"><h3>Filters</h3><button class="fdc" data-a="cdw">${IC.x}</button></div>`:""}
    <div class="fs"><h3>Make</h3>
      <select class="fsel" id="${px}fmk">
        <option value="">All Makes</option>
        ${TOP_MAKES.map(m=>`<option value="${m}"${f.make===m?" selected":""}>${m}</option>`).join("")}
      </select>
    </div>
    <div class="fs"><h3>Model</h3>
      <select class="fsel" id="${px}fmd"${!f.make?" disabled":""}>
        <option value="">All Models</option>
        ${models.map(m=>`<option value="${m}"${f.model===m?" selected":""}>${m}</option>`).join("")}
      </select>
    </div>
    <div class="fs"><h3>Year</h3>
      <div class="fr">
        <select class="fsel" id="${px}fymn"><option value="">Min</option>${years.slice().reverse().map(y=>`<option value="${y}"${yrParts[0]===String(y)?" selected":""}>${y}</option>`).join("")}</select>
        <select class="fsel" id="${px}fymx"><option value="">Max</option>${years.map(y=>`<option value="${y}"${yrParts[1]===String(y)?" selected":""}>${y}</option>`).join("")}</select>
      </div>
    </div>
    <div class="fs"><h3>Price</h3>
      <div class="fr">
        <input class="fin" id="${px}fpmn" type="text" placeholder="$ Min" value="${prParts[0]&&prParts[0]!=="0"?"$"+fmt(parseInt(prParts[0])):""}">
        <input class="fin" id="${px}fpmx" type="text" placeholder="$ Max" value="${prParts[1]?"$"+fmt(parseInt(prParts[1])):""}">
      </div>
    </div>
    <div class="fs"><h3>Max Mileage</h3>
      <input class="fin" id="${px}fml" type="text" placeholder="e.g. 50,000" value="${f.miles_range?fmt(parseInt(f.miles_range.replace("0-",""))):""}">
    </div>
    <div class="fs"><h3>Body Type</h3><div class="cg">${chips(BODY_TYPES,"body_type")}</div></div>
    <div class="fs"><h3>Fuel Type</h3><div class="cg">${chips(FUEL_TYPES,"fuel_type")}</div></div>
    <div class="fs"><h3>Drivetrain</h3><div class="cg">${chips(DRIVETRAINS,"drivetrain")}</div></div>
    <div class="fs"><h3>Exterior Color</h3><div class="cg">${chips(EXTERIOR_COLORS,"exterior_color")}</div></div>
    <div class="fs"><h3>Interior Color</h3><div class="cg">${chips(INTERIOR_COLORS,"interior_color")}</div></div>
    <div class="fs"><h3>Location</h3>
      <div class="fr">
        <input class="fin" id="${px}fzp" type="text" placeholder="ZIP Code" maxlength="5" value="${f.zip||""}">
        <select class="fsel" id="${px}frd"><option value="">Radius</option>${["25","50","75","100","200"].map(r=>`<option value="${r}"${f.radius===r?" selected":""}>${r} mi</option>`).join("")}</select>
      </div>
    </div>
    <div class="fs"><h3>Sort By</h3>
      <select class="fsel" id="${px}fst"><option value="">Relevance</option>${SORT_OPTIONS.map(o=>`<option value="${o.value}"${f.sort_by===o.value?" selected":""}>${o.label}</option>`).join("")}</select>
    </div>
    <div class="fa"><button class="bsrch" data-a="srch">Search</button><button class="brst" data-a="rst">Reset</button></div>
    ${hStats()}
  `;
}

function hStats(): string {
  const s = stats();
  if (!s) return "";
  const mx = Math.max(...Object.values(s.bd));
  return `<div class="stp">
    <div class="stt${S.statsOpen?" op":""}" data-a="tst"><span>Market Stats</span>${IC.chevDown}</div>
    ${S.statsOpen?`<div class="stb">
      <div class="str"><span class="stl">Price Range</span><span class="stv">${fmtP(s.pMin)} - ${fmtP(s.pMax)}</span></div>
      <div class="str"><span class="stl">Avg Price</span><span class="stv">${fmtP(s.pAvg)}</span></div>
      <div class="str"><span class="stl">Avg Mileage</span><span class="stv">${fmt(s.mAvg)} mi</span></div>
      <div class="bch">${Object.entries(s.bd).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`<div class="brw"><span class="brl">${t}</span><div class="brt"><div class="brf" style="width:${(c/mx)*100}%;background:${bCol(t)}"></div></div><span class="brc">${c}</span></div>`).join("")}</div>
    </div>`:""}
  </div>`;
}

function hCard(c: CarListing, i: number): string {
  const b = badges(c), col = bCol(c.body_type);
  return `<div class="cd fi" data-a="vd" data-i="${i}">
    <div class="cp" style="background:linear-gradient(135deg,${col}22,${col}44)">
      ${c.photo_url?`<img src="${esc(c.photo_url)}" alt="${esc(c.heading)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:""}
      <div class="cpp" style="color:${col}${c.photo_url?";display:none":""}">${IC.carSil}<span class="cpm">${esc(c.make)}</span></div>
      ${b.length?`<div class="cbs">${b.map(x=>`<span class="bdg" style="background:${x.c}">${x.t}</span>`).join("")}</div>`:""}
      <span class="cdm">${c.dom>0?c.dom+"d on market":"New"}</span>
    </div>
    <div class="cby">
      <div class="ctt">${esc(c.heading)}</div>
      <div class="cpr"><span class="cpv">${c.price?fmtP(c.price):"Call for Price"}</span>${c.price?`<span class="ces">${fmtM(c.price)}</span>`:""}</div>
      <div class="cme"><span class="cmi">${IC.gauge} ${fmt(c.miles)} mi</span><span class="cmi">${IC.pin} ${esc(c.city)}, ${esc(c.state)}</span></div>
      <div class="csp">${c.engine?`<span>${esc(c.engine)}</span>`:""}${c.engine&&c.transmission?`<span class="sp">|</span>`:""}${c.transmission?`<span>${esc(c.transmission)}</span>`:""}${(c.engine||c.transmission)&&c.drivetrain?`<span class="sp">|</span>`:""}${c.drivetrain?`<span>${esc(c.drivetrain)}</span>`:""}</div>
      <button class="cbn" data-a="vd" data-i="${i}">View Details</button>
    </div>
  </div>`;
}

// ─── View Renderers ──────────────────────────────────────────────

function vSearch(): string {
  const tags = activeTags();
  const more = !S.mock && S.listings.length < S.total;
  return `<div class="lay">
    <aside class="sb">${hFilters()}</aside>
    <div class="fov${S.drawerOpen?" vis":""}" data-a="cdw"></div>
    <div class="fdw${S.drawerOpen?" op":""}">${hFilters(true)}</div>
    <main class="mn">
      ${_detectAppMode() === "demo" ? `<div id="_demo_banner" style="background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #f59e0b55;border-radius:14px;padding:18px 24px;margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;box-shadow:0 4px 20px rgba(245,158,11,0.08);">
        <div style="width:42px;height:42px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:20px;">⚡</span>
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="font-size:14px;font-weight:700;color:#fbbf24;margin-bottom:2px;">Demo Mode — Showing sample data</div>
          <div style="font-size:12px;color:#94a3b8;">Add your MarketCheck API key to search real inventory.
            <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;font-weight:600;">Get a free key →</a></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="_banner_key" type="text" placeholder="Paste API key"
            style="padding:10px 14px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;width:200px;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='#f59e0b'" onblur="this.style.borderColor='#334155'" />
          <button id="_banner_save"
            style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0f172a;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">Activate</button>
        </div>
      </div>` : ""}
      <div class="nlp-bar">
        <div class="nlp-wrap">
          <input type="text" id="nlpBarIn" class="nlp-input" placeholder="Describe what you're looking for... e.g. 'red Toyota SUV under $35,000'" value="${S._lastNlp||""}" />
          <button class="nlp-go" data-a="nlpbar">${IC.search}</button>
        </div>
      </div>
      ${S._nlpWarning ? `<div style="background:linear-gradient(135deg,#7f1d1d22,#ef444411);border:1px solid #ef444444;border-radius:8px;padding:10px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:16px;">⚠️</span>
        <span style="font-size:13px;color:#f87171;">${esc(S._nlpWarning)}</span>
        <span style="margin-left:auto;cursor:pointer;color:#ef4444;font-size:16px;font-weight:700;" data-a="cnlpw">×</span>
      </div>` : ""}
      <button class="mft" data-a="odw">${IC.filter} Filters</button>
      <div class="rb">
        <div class="rc"><b>${fmt(S.total)}</b> vehicles found${S.mock?`<span class="mb">Sample Data</span>`:""}</div>
        ${tags.length?`<div class="fts">${tags.map(t=>`<span class="ft">${esc(t.label)}<span class="ftx" data-a="rf" data-k="${t.key}">x</span></span>`).join("")}</div>`:""}
      </div>
      ${(()=>{ const s=stats(); return s?`<div class="mstats"><div class="mst"><span class="msl">Avg Price</span><span class="msv">${fmtP(s.pAvg)}</span></div><div class="mst"><span class="msl">Price Range</span><span class="msv">${fmtP(s.pMin)} – ${fmtP(s.pMax)}</span></div><div class="mst"><span class="msl">Avg Mileage</span><span class="msv">${fmt(s.mAvg)} mi</span></div><div class="mst"><span class="msl">Results</span><span class="msv">${fmt(S.listings.length)}</span></div></div>`:""; })()}
      ${S.loading?`<div class="ld"><div class="spin"></div><span class="ldt">Searching vehicles...</span></div>`
        :S.listings.length?`<div class="cg2">${S.listings.map((c,i)=>hCard(c,i)).join("")}</div>${more?`<div class="lmc"><button class="blm" data-a="lm">Load More Vehicles</button></div>`:""}`
        :`<div class="emp">${IC.car}<h3>No vehicles found</h3><p>Try adjusting your filters or search criteria</p></div>`}
    </main>
  </div>`;
}

function vDetail(): string {
  const c = S.listings[S.detailIdx];
  if (!c) return vSearch();
  const b = badges(c), col = bCol(c.body_type), cp = comps(c);
  let pp = 50;
  if (c.predicted_price && c.price) pp = Math.max(5,Math.min(95, c.price/c.predicted_price*50));
  const allPhotos = c.photo_urls?.length ? c.photo_urls : (c.photo_url ? [c.photo_url] : []);
  const photoIdx = S._detailPhotoIdx || 0;

  // Only show spec rows that have values
  const specRows = [
    ["Engine",c.engine],["Transmission",c.transmission],["Drivetrain",c.drivetrain],["Fuel Type",c.fuel_type],
    ["Mileage",c.miles?fmt(c.miles)+" mi":""],["Exterior Color",c.exterior_color],["Interior Color",c.interior_color],
    ["Body Type",c.body_type],["Doors",c.doors?String(c.doors):""],["VIN",c.vin],
    ["Cylinders",c.cylinders?String(c.cylinders):""],["Engine Size",c.engine_size],
    ["City MPG",c.city_mpg?String(c.city_mpg):""],["Highway MPG",c.highway_mpg?String(c.highway_mpg):""],
    ["MSRP",c.msrp?fmtP(c.msrp):""],
    ["Days on Market",c.dom?String(c.dom):""],["First Seen",c.first_seen||""],
  ].filter(([_,v])=>v); // Filter out empty values

  return `<div class="dv-wrap fi">
    <button class="bbk" data-a="bts">${IC.left} Back to Results</button>
    <div class="dv-inner">
    <!-- Photo Carousel -->
    <div class="dh">
      <div class="carousel-wrap">
        ${allPhotos.length>0?`
          <div class="carousel-main" style="background:linear-gradient(135deg,${col}22,${col}44)">
            <img id="carousel-img" src="${esc(allPhotos[photoIdx])}" alt="${esc(c.heading)}" onerror="this.style.display='none'">
            ${allPhotos.length>1?`
              <button class="car-nav car-prev" data-a="cprev">${IC.left}</button>
              <button class="car-nav car-next" data-a="cnext">${IC.right}</button>
              <span class="car-count">${photoIdx+1} / ${allPhotos.length}</span>
            `:""}
          </div>
          ${allPhotos.length>1?`<div class="carousel-thumbs">${allPhotos.slice(0,12).map((p,i)=>`<img class="car-thumb${i===photoIdx?" active":""}" src="${esc(p)}" data-a="cthumb" data-pi="${i}" alt="Photo ${i+1}" onerror="this.style.display='none'">`).join("")}</div>`:""}
        `:`<div class="carousel-main" style="background:linear-gradient(135deg,${col}33,${col}55)"><div class="dpp" style="color:${col}">${IC.carSil}<span class="dpm">${esc(c.make)} ${esc(c.model)}</span></div></div>`}
      </div>
      <div class="dhb">
        <div class="dtt">${esc(c.heading)}</div>
        <div class="dprr"><span class="dpv">${c.price?fmtP(c.price):"Call for Price"}</span>${c.price?`<span class="des">${fmtM(c.price)}</span>`:""}</div>
        ${b.length?`<div class="dbs">${b.map(x=>`<span class="db" style="background:${x.c}">${x.t}</span>`).join("")}</div>`:""}
        <div class="dlc">${IC.pin} ${esc(c.city)}, ${esc(c.state)} ${esc(c.zip)} &mdash; ${esc(c.dealer_name)}</div>
      </div>
    </div>

    <div class="ds"><div class="dst">${IC.grid} Specifications</div>
      <div class="sg">${specRows.map(([l,v])=>`<div class="si"><span class="sil">${l}</span><span class="siv">${esc(v)}</span></div>`).join("")}</div>
    </div>

    ${c.options.length?`<div class="ds"><div class="dst">&#9881; Options &amp; Packages</div>
      <div class="opt-grid">${c.options.map(o=>`<span class="opt-tag">${esc(o)}</span>`).join("")}</div>
    </div>`:""}

    ${c.features.length?`<div class="ds"><div class="dst">&#9733; Key Features</div>
      <div class="opt-grid">${c.features.map(f=>`<span class="feat-tag">${esc(f)}</span>`).join("")}</div>
    </div>`:""}

    ${c.seller_comments?`<div class="ds"><div class="dst">&#128172; Seller Comments</div>
      <div class="seller-comments">${esc(c.seller_comments).replace(/\n/g,"<br>")}</div>
    </div>`:""}

    ${c.predicted_price?`<div class="ds"><div class="dst">${IC.tag} Price Analysis</div>
      <div class="pa"><div class="pbc"><div class="pbt"><div class="pbm" style="left:${pp}%"></div></div><div class="pbl"><span>Below Market</span><span>Above Market</span></div></div>
      <div class="pav">
        <div class="par"><span class="stl">Listing Price</span><span class="stv">${fmtP(c.price)}</span></div>
        <div class="par"><span class="stl">Predicted Price</span><span class="stv">${fmtP(c.predicted_price)}</span></div>
        <div class="par"><span class="stl">Difference</span><span class="stv" style="color:${c.price<c.predicted_price?"#16a34a":"#ef4444"}">${c.price<c.predicted_price?"-":"+"}${fmtP(Math.abs(c.predicted_price-c.price))}</span></div>
      </div></div>
    </div>`:""}

    ${cp.length?`<div class="ds"><div class="dst">${IC.bar} Comparable Vehicles</div>
      <div class="cpl">${cp.map(x=>{
        const ci = S.listings.findIndex(l=>l.id===x.id);
        return `<div class="cpi" data-a="vc" data-id="${x.id}" data-i="${ci>=0?ci:""}"><div><div class="cpn">${esc(x.heading)}</div><div class="cpd">${fmt(x.miles)} mi &middot; ${esc(x.city)}, ${esc(x.state)}</div></div><span class="cppr">${fmtP(x.price)}</span></div>`;
      }).join("")}</div>
    </div>`:""}

    <div class="ds"><div class="dst">${IC.store} Dealer Information</div>
      <div class="dlr"><div class="dli"><h4>${esc(c.dealer_name)}</h4><p>${esc(c.city)}, ${esc(c.state)} ${esc(c.zip)}</p></div>
        ${c.vdp_url?`<a class="bds" href="${esc(c.vdp_url)}" target="_blank" rel="noopener noreferrer">View on Dealer Site ${IC.ext}</a>`:""}</div>
    </div>

    <div class="das">
      <button class="ba" data-a="shv">${IC.share} Share This Vehicle</button>
      <button class="ba pri" data-a="bts">${IC.left} Back to Search</button>
    </div>
    </div>
  </div>`;
}

function vNlp(): string {
  return `<div class="nv fi">
    <div class="nh"><div class="ni">${IC.spark}</div><h2 class="ntl">Natural Language Search</h2><p class="nst">Describe the car you want in plain English</p></div>
    <div class="nig"><textarea class="nta" id="nlpIn" placeholder="Describe what you're looking for..."></textarea><button class="nsb" data-a="nlps">${IC.right}</button></div>
    <div id="nlpP"></div>
    <div class="nex"><h4>Try an example</h4>
      <div class="ne" data-a="nlpe" data-q="Red Toyota Camry under $25,000 near Denver">"Red Toyota Camry under $25,000 near Denver"</div>
      <div class="ne" data-a="nlpe" data-q="Electric SUV with less than 30,000 miles">"Electric SUV with less than 30,000 miles"</div>
      <div class="ne" data-a="nlpe" data-q="Family-friendly minivan under $35,000 in California">"Family-friendly minivan under $35,000 in California"</div>
      <div class="ne" data-a="nlpe" data-q="Luxury sedan 2022 or newer with AWD">"Luxury sedan 2022 or newer with AWD"</div>
    </div>
  </div>`;
}

const _titleWords = ["Car Search", "Natural Language Search"];
let _titleIdx = 0;
setInterval(() => { _titleIdx = (_titleIdx + 1) % _titleWords.length; const el = document.getElementById("hdr-title"); if (el) { el.style.opacity = "0"; setTimeout(() => { el.textContent = _titleWords[_titleIdx]; el.style.opacity = "1"; }, 300); } }, 3000);

function hHeader(): string {
  return `<header class="hdr">
    <div class="hdr-l"><img src="https://34682200.delivery.rocketcdn.me/wp-content/uploads/2024/05/cropped-MC-Icon.png.webp" alt="MC" onerror="this.style.display='none'"><span id="hdr-title" style="transition:opacity 0.3s ease">${_titleWords[_titleIdx]}</span></div>
    <div class="hdr-r">
      <div class="aki"><input type="text" id="akIn" placeholder="API Key" value="${esc(apiKey()||"")}"></div>
      <button class="hb${S.view==="nlp"?" on":""}" data-a="tnlp">${IC.spark}<span>NLP Search</span></button>
      <button class="hb" data-a="tdk">${S.dark?IC.sun:IC.moon}</button>
    </div>
  </header>`;
}

// ─── Main Draw ───────────────────────────────────────────────────

function draw() {
  const el = document.getElementById("app");
  if (!el) return;
  let body = "";
  switch (S.view) {
    case "search":  body = vSearch(); break;
    case "details": body = vDetail(); break;
    case "nlp":     body = vNlp();    break;
  }
  el.innerHTML = hHeader() + body;
  bind();
}

// ─── Event Binding (non-click only; clicks via delegation) ──────

function bind() {
  // Demo banner activation
  const bannerSave = document.getElementById("_banner_save");
  const bannerKey = document.getElementById("_banner_key") as HTMLInputElement;
  if (bannerSave && bannerKey) {
    bannerSave.onclick = () => {
      const k = bannerKey.value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      const banner = document.getElementById("_demo_banner");
      if (banner) banner.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading...</div>';
      setTimeout(() => location.reload(), 800);
    };
    bannerKey.onkeydown = (e) => { if (e.key === "Enter") bannerSave.click(); };
  }

  const ak = document.getElementById("akIn") as HTMLInputElement;
  if (ak) {
    ak.onchange = () => {
      const v = ak.value.trim();
      if (v) localStorage.setItem("mc_api_key", v);
      else localStorage.removeItem("mc_api_key");
    };
  }

  const nlp = document.getElementById("nlpIn") as HTMLTextAreaElement;
  if (nlp) {
    nlp.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runNlp(nlp.value); }
    };
  }

  // Make dropdown — cascading + immediate search
  for (const id of ["fmk","d-fmk"]) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (el) {
      el.onchange = () => { S.filters.make = el.value||undefined; delete S.filters.model; readDOM(); doSearch(); };
    }
  }

  // Model dropdown — immediate search on change
  for (const id of ["fmd","d-fmd"]) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (el) el.onchange = () => { readDOM(); doSearch(); };
  }

  // Select dropdowns (sort, radius, year min/max) — immediate search on change
  for (const id of ["fst","d-fst","frd","d-frd","fymn","d-fymn","fymx","d-fymx"]) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (el) el.onchange = () => { readDOM(); doSearch(); };
  }

  // NLP bar Enter key
  const nlpBar = document.getElementById("nlpBarIn") as HTMLInputElement;
  if (nlpBar) {
    nlpBar.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); if (nlpBar.value.trim()) runNlp(nlpBar.value); } };
  }

  // Text/number inputs (price min/max, miles, zip) — auto-search on input with debounce
  for (const id of ["fpmn","fpmx","fml","fzp","d-fpmn","d-fpmx","d-fml","d-fzp"]) {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.oninput = () => autoSearch();
  }
}

// ─── Global Click Delegation ─────────────────────────────────────

function readDOM(px="") {
  const v = (id:string) => (document.getElementById(px+id) as HTMLInputElement|HTMLSelectElement)?.value||"";
  const f = S.filters;

  const mk=v("fmk"), md=v("fmd"), ymn=v("fymn"), ymx=v("fymx");
  const pmn=v("fpmn").replace(/[^0-9]/g,""), pmx=v("fpmx").replace(/[^0-9]/g,"");
  const ml=v("fml").replace(/[^0-9]/g,""), zp=v("fzp"), rd=v("frd"), st=v("fst");

  f.make=mk||undefined; f.model=md||undefined;
  f.year_range=(ymn||ymx)?`${ymn||"2015"}-${ymx||"2026"}`:undefined;
  f.price_range=(pmn||pmx)?`${pmn||"0"}-${pmx||""}`:undefined;
  f.miles_range=ml?`0-${ml}`:undefined;
  f.zip=zp||undefined; f.radius=rd||undefined; f.sort_by=st||undefined;
}

function resetAll() {
  const keys: (keyof SearchFilters)[] = ["make","model","year_range","price_range","miles_range","body_type","fuel_type","drivetrain","exterior_color","interior_color","zip","radius","sort_by"];
  keys.forEach(k => delete S.filters[k]);
  S.filters.start=0; S.filters.rows=24; S.page=0;
  S.mock=true; S.listings=[...MOCK]; S.total=MOCK.length;
  S._nlpWarning=""; S._lastNlp="";
}

function toggleChip(key: keyof SearchFilters, val: string) {
  const cur = ((S.filters[key] as string)||"").split(",").filter(Boolean);
  const i = cur.indexOf(val);
  if (i>=0) cur.splice(i,1); else cur.push(val);
  if (cur.length) (S.filters as any)[key]=cur.join(","); else delete S.filters[key];
  doSearch();
}

// Debounced auto-search: triggers search 500ms after last filter change
let _searchTimer: ReturnType<typeof setTimeout>|null = null;
function autoSearch() {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { readDOM(); doSearch(); }, 500);
}

function runNlp(query: string) {
  if (!query.trim()) return;
  S._lastNlp = query;
  const p = parseNlp(query);
  const matched = Object.entries(p).filter(([_,v])=>v);
  const el = document.getElementById("nlpP");
  if (el) {
    const tags = matched.map(([k,v])=>`<span class="np">${k}: ${v}</span>`).join("");
    el.innerHTML = tags?`<div class="nps"><h4>Parsed Parameters</h4><div class="npt">${tags}</div></div>`:"";
  }

  // Detect unmatched terms — warn user if query had words we couldn't parse
  const matchedWords = matched.map(([_,v])=>String(v).toLowerCase()).join(" ").split(/[\s,]+/).filter(Boolean);
  const queryWords = query.toLowerCase().replace(/[^a-z0-9\s-]/g,"").split(/\s+/).filter(w => w.length > 2);
  const stopWords = ["the","and","with","for","under","below","above","over","less","than","more","near","around","car","cars","vehicle","vehicles","find","show","search","looking","want","need","get","buy","used","new","good","best","great","nice","cheap","affordable","luxury","family","friendly"];
  const unmatched = queryWords.filter(w => !stopWords.includes(w) && !matchedWords.some(m => m.includes(w) || w.includes(m)));

  if (unmatched.length > 0 && matched.length === 0) {
    // Nothing parsed at all — show prominent warning in NLP bar area
    S._nlpWarning = `Could not match "${unmatched.join(" ")}" to any known filter. Try using specific make/model names (e.g. "Mercedes-Benz"), body types, or price ranges.`;
  } else if (unmatched.length > 0) {
    S._nlpWarning = `Note: "${unmatched.join(", ")}" was not recognized as a filter and was ignored.`;
  } else {
    S._nlpWarning = "";
  }

  Object.assign(S.filters, p);
  S.filters.start=0; S.filters.rows=24; S.page=0;
  setTimeout(()=>{ S.view="search"; setHash(); doSearch(); }, 600);
}

function onClick(e: Event) {
  const t = (e.target as HTMLElement).closest("[data-a]") as HTMLElement|null;
  if (!t) {
    // Check for chip clicks
    const chip = (e.target as HTMLElement).closest(".ch") as HTMLElement|null;
    if (chip) {
      const ck = chip.dataset.ck as keyof SearchFilters;
      const cv = chip.dataset.cv||"";
      if (ck && cv) toggleChip(ck, cv);
    }
    return;
  }

  const a = t.dataset.a;
  switch (a) {
    case "tdk":
      S.dark=!S.dark; localStorage.setItem("mc_dark",S.dark?"1":"0");
      document.documentElement.setAttribute("data-theme",S.dark?"dark":"light");
      draw(); break;
    case "tnlp":
      S.view = S.view==="nlp"?"search":"nlp"; setHash(); draw(); break;
    case "srch":
      readDOM(); S.drawerOpen=false; doSearch(); break;
    case "rst":
      resetAll(); draw(); break;
    case "odw":
      S.drawerOpen=true; draw(); break;
    case "cdw":
      S.drawerOpen=false; draw(); break;
    case "tst":
      S.statsOpen=!S.statsOpen; draw(); break;
    case "vd": {
      const i=parseInt(t.dataset.i||"-1");
      if (i>=0&&i<S.listings.length) { S.view="details"; S.detailIdx=i; S._detailPhotoIdx=0; setHash(); draw(); window.scrollTo(0,0); }
    } break;
    case "vc": {
      const id=t.dataset.id, ci=parseInt(t.dataset.i||"-1");
      if (ci>=0) { S.detailIdx=ci; setHash(); draw(); window.scrollTo(0,0); }
      else if (id) {
        const mc=MOCK.find(c=>c.id===id);
        if (mc) { S.listings.push(mc); S.detailIdx=S.listings.length-1; setHash(); draw(); window.scrollTo(0,0); }
      }
    } break;
    case "bts":
      S.view="search"; setHash(); draw(); break;
    case "shv": {
      const c=S.listings[S.detailIdx];
      if (c) {
        const u=`${location.origin}${location.pathname}${location.search}#/vehicle/${S.detailIdx}`;
        if (navigator.share) navigator.share({title:c.heading,text:`${c.heading} - ${fmtP(c.price)}`,url:u});
        else navigator.clipboard.writeText(u).then(()=>{
          const o=t.innerHTML; t.innerHTML="Link Copied!"; setTimeout(()=>{t.innerHTML=o;},2000);
        });
      }
    } break;
    case "lm":
      S.page++; S.filters.start=S.page*S.filters.rows; doSearch(false); break;
    case "rf": {
      const k=t.dataset.k as keyof SearchFilters;
      if (k) { delete S.filters[k]; if (k==="make") delete S.filters.model; if (k==="zip") delete S.filters.radius; doSearch(); }
    } break;
    case "nlps": {
      const inp=document.getElementById("nlpIn") as HTMLTextAreaElement;
      if (inp) runNlp(inp.value);
    } break;
    case "nlpe": {
      const q=t.dataset.q||"";
      const inp=document.getElementById("nlpIn") as HTMLTextAreaElement;
      if (inp) { inp.value=q; runNlp(q); }
    } break;
    case "nlpbar": {
      const inp=document.getElementById("nlpBarIn") as HTMLInputElement;
      if (inp?.value.trim()) runNlp(inp.value);
    } break;
    case "cprev": {
      const c=S.listings[S.detailIdx];
      if (c?.photo_urls?.length) { S._detailPhotoIdx = (S._detailPhotoIdx - 1 + c.photo_urls.length) % c.photo_urls.length; draw(); }
    } break;
    case "cnext": {
      const c=S.listings[S.detailIdx];
      if (c?.photo_urls?.length) { S._detailPhotoIdx = (S._detailPhotoIdx + 1) % c.photo_urls.length; draw(); }
    } break;
    case "cthumb": {
      const pi=parseInt(t.dataset.pi||"0");
      S._detailPhotoIdx = pi; draw();
    } break;
    case "cnlpw":
      S._nlpWarning = ""; draw(); break;
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────

(function boot() {
  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);

  const style = document.createElement("style");
  style.textContent = css();
  document.head.appendChild(style);

  document.documentElement.setAttribute("data-theme", S.dark ? "dark" : "light");

  // Single global click handler
  document.addEventListener("click", onClick);

  // Hash routing
  window.addEventListener("hashchange", onHash);

  // Initial render
  onHash();

  // Read URL params for deep-linking filters
  const _urlP = new URLSearchParams(location.search);
  if (_urlP.get("make")) S.filters.make = _urlP.get("make")!;
  if (_urlP.get("model")) S.filters.model = _urlP.get("model")!;
  if (_urlP.get("year")) S.filters.year_range = _urlP.get("year")!;
  if (_urlP.get("zip")) S.filters.zip = _urlP.get("zip")!;
  if (_urlP.get("radius")) S.filters.radius = _urlP.get("radius")!;
  if (_urlP.get("body_type")) S.filters.body_type = _urlP.get("body_type")!;
  if (_urlP.get("fuel_type")) S.filters.fuel_type = _urlP.get("fuel_type")!;
  if (_urlP.get("drivetrain")) S.filters.drivetrain = _urlP.get("drivetrain")!;
  if (_urlP.get("price_range")) S.filters.price_range = _urlP.get("price_range")!;
  if (_urlP.get("miles_range")) S.filters.miles_range = _urlP.get("miles_range")!;
  if (_urlP.get("exterior_color")) S.filters.exterior_color = _urlP.get("exterior_color")!;
  if (_urlP.get("interior_color")) S.filters.interior_color = _urlP.get("interior_color")!;
  if (_urlP.get("sort_by")) S.filters.sort_by = _urlP.get("sort_by")!;

  // If API key or URL filters present, auto-search
  const hasUrlFilters = ["make","model","year","zip","body_type","fuel_type","drivetrain","price_range","miles_range"].some(k => _urlP.get(k));
  if ((apiKey() || hasUrlFilters) && S.view === "search") doSearch();
  else if (hasUrlFilters) { S.listings = filterLocal(); S.total = S.listings.length; draw(); }
})();
