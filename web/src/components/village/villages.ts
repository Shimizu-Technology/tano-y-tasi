// Fractions refer to Christian’s illustration, not geographic coordinates.
// Crop bounds and label adjustments: see the Feature E evidence crop-manifest.json.
export type Village = { name: string; slug: string; x: number; y: number; aliases: string[]; alternate?: string; cropBase: string; cropWidth: number };

export const villages: Village[] = [
  {"name": "Yigo", "slug": "yigo", "x": 0.8466, "y": 0.1774, "aliases": [], "cropBase": "/images/products/guahan-sunset-map/villages/yigo", "cropWidth": 3200},
  {"name": "Dededo", "slug": "dededo", "x": 0.6956, "y": 0.2484, "aliases": [], "cropBase": "/images/products/guahan-sunset-map/villages/dededo", "cropWidth": 3200},
  {"name": "Tamuning", "slug": "tamuning", "x": 0.5682, "y": 0.3871, "aliases": ["Tumon", "Tamuning-Tumon-Harmon"], "cropBase": "/images/products/guahan-sunset-map/villages/tamuning", "cropWidth": 3200},
  {"name": "Barrigada", "slug": "barrigada", "x": 0.6023, "y": 0.4387, "aliases": [], "cropBase": "/images/products/guahan-sunset-map/villages/barrigada", "cropWidth": 3200},
  {"name": "Hagåtña", "slug": "hagatna", "x": 0.3571, "y": 0.4439, "aliases": ["Agana", "Hagatna"], "cropBase": "/images/products/guahan-sunset-map/villages/hagatna", "cropWidth": 3200, "alternate": "Agana"},
  {"name": "Agana Heights", "slug": "agana-heights", "x": 0.302, "y": 0.358, "aliases": ["Tutuhan"], "cropBase": "/images/products/guahan-sunset-map/villages/agana-heights", "cropWidth": 6800},
  {"name": "Sinajana", "slug": "sinajana", "x": 0.314, "y": 0.373, "aliases": ["Sinahånña"], "cropBase": "/images/products/guahan-sunset-map/villages/sinajana", "cropWidth": 6200},
  {"name": "Mongmong-Toto-Maite", "slug": "mongmong-toto-maite", "x": 0.27, "y": 0.388, "aliases": ["Mongmong", "Toto", "Maite"], "cropBase": "/images/products/guahan-sunset-map/villages/mongmong-toto-maite", "cropWidth": 6200},
  {"name": "Asan-Maina", "slug": "asan-maina", "x": 0.3312, "y": 0.4839, "aliases": ["Asan", "Maina"], "cropBase": "/images/products/guahan-sunset-map/villages/asan-maina", "cropWidth": 3200},
  {"name": "Chalan Pago-Ordot", "slug": "chalan-pago-ordot", "x": 0.4627, "y": 0.4903, "aliases": ["Chalan Pago", "Ordot"], "cropBase": "/images/products/guahan-sunset-map/villages/chalan-pago-ordot", "cropWidth": 3200},
  {"name": "Mangilao", "slug": "mangilao", "x": 0.586, "y": 0.5052, "aliases": [], "cropBase": "/images/products/guahan-sunset-map/villages/mangilao", "cropWidth": 3200},
  {"name": "Piti", "slug": "piti", "x": 0.2151, "y": 0.5148, "aliases": [], "cropBase": "/images/products/guahan-sunset-map/villages/piti", "cropWidth": 3200},
  {"name": "Santa Rita-Sumai", "slug": "santa-rita-sumai", "x": 0.239, "y": 0.562, "aliases": ["Santa Rita", "Sumay"], "cropBase": "/images/products/guahan-sunset-map/villages/santa-rita-sumai", "cropWidth": 3600},
  {"name": "Yona", "slug": "yona", "x": 0.3977, "y": 0.5561, "aliases": ["Yoña"], "cropBase": "/images/products/guahan-sunset-map/villages/yona", "cropWidth": 3200},
  {"name": "Hågat", "slug": "hagat", "x": 0.2192, "y": 0.6368, "aliases": ["Agat", "Hagat"], "cropBase": "/images/products/guahan-sunset-map/villages/hagat", "cropWidth": 3200, "alternate": "Agat"},
  {"name": "Talofofo", "slug": "talofofo", "x": 0.4343, "y": 0.6355, "aliases": ["Talo'fo'fo"], "cropBase": "/images/products/guahan-sunset-map/villages/talofofo", "cropWidth": 3200},
  {"name": "Humåtak", "slug": "humatak", "x": 0.26, "y": 0.719, "aliases": ["Umatac", "Humatak"], "cropBase": "/images/products/guahan-sunset-map/villages/humatak", "cropWidth": 3200, "alternate": "Umatac"},
  {"name": "Inalåhan", "slug": "inalahan", "x": 0.4586, "y": 0.7174, "aliases": ["Inarajan", "Inalahan"], "cropBase": "/images/products/guahan-sunset-map/villages/inalahan", "cropWidth": 3200, "alternate": "Inarajan"},
  {"name": "Malesso'", "slug": "malesso", "x": 0.3328, "y": 0.8213, "aliases": ["Merizo", "Malesso"], "cropBase": "/images/products/guahan-sunset-map/villages/malesso", "cropWidth": 3200, "alternate": "Merizo"},
];
