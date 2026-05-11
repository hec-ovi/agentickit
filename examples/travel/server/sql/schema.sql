-- Travel-themed product catalog used by the SQL plugin demo.
--
-- Three tables, hand-seeded with ~30 products + ~90 reviews so the
-- agent has enough variety to answer questions like "which packing
-- cubes are highest-rated under $40" with a real query.

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  price_usd REAL NOT NULL,
  weight_grams INTEGER,
  in_stock INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);

INSERT INTO categories (id, name, description) VALUES
  (1, 'luggage', 'Suitcases, backpacks, duffels, and packing organizers.'),
  (2, 'electronics', 'Adapters, batteries, headphones, and travel-friendly tech.'),
  (3, 'comfort', 'Neck pillows, eye masks, blankets, footrests for long flights.'),
  (4, 'toiletries', 'Travel-size bottles, kits, dopp kits, dental + grooming.'),
  (5, 'apparel', 'Quick-dry tees, packable jackets, compression socks, sun hats.');

INSERT INTO products (id, name, category_id, price_usd, weight_grams, in_stock, description) VALUES
  -- Luggage
  (101, 'Carry-on Spinner 22"',         1,  189.00, 3100, 1, 'Hard-shell polycarbonate, TSA lock, 360 wheels.'),
  (102, 'Daypack 25L',                  1,   79.00,  680, 1, 'Water-resistant, laptop sleeve, hidden RFID pocket.'),
  (103, 'Compression Packing Cubes (4)', 1,   34.00,  340, 1, 'Set of four; compression zip; mesh top.'),
  (104, 'Weekender Duffel',             1,   95.00, 1100, 1, 'Soft-sided 40L, shoulder strap, shoe compartment.'),
  (105, 'Ultralight Drybag 20L',        1,   28.00,  140, 1, 'Roll-top, seam-sealed, packs into its own pouch.'),
  (106, 'Garment Folder',               1,   24.00,  220, 0, 'Out of stock. Keeps two shirts wrinkle-free.'),

  -- Electronics
  (201, 'Universal Adapter',            2,   29.00,  170, 1, 'Type A/B/C/G/I, USB-C 30W PD + 2 USB-A.'),
  (202, 'Power Bank 20000mAh',          2,   59.00,  410, 1, 'USB-C 65W PD, two output ports, airline-legal.'),
  (203, 'Noise-Cancelling Earbuds',     2,  179.00,   55, 1, 'IPX5, 8h battery, transparent mode.'),
  (204, 'Travel Router',                2,   55.00,   95, 1, 'Wi-Fi 6, VPN-ready, login-portal pass-through.'),
  (205, 'Compact Charging Cable Kit',   2,   18.00,   85, 1, 'USB-C/Lightning/MicroUSB in a zip pouch.'),
  (206, 'Translator Earpiece',          2,  149.00,   30, 0, 'Out of stock. 40 languages, offline mode.'),

  -- Comfort
  (301, 'Memory-Foam Neck Pillow',      3,   38.00,  240, 1, 'Adjustable strap, washable cover.'),
  (302, 'Silk Sleep Mask',              3,   22.00,   30, 1, 'Contoured, blackout, two strap sizes.'),
  (303, 'Compression Footrest Hammock', 3,   25.00,  160, 1, 'Hooks under the tray table; relieves back fatigue.'),
  (304, 'Earplug Pack (3 pairs)',       3,    9.00,   10, 1, 'Foam + silicone + flanged; high-NRR.'),
  (305, 'Packable Travel Blanket',      3,   46.00,  290, 1, 'Folds into its own pillow; machine-washable.'),
  (306, 'Lumbar Support Cushion',       3,   32.00,  340, 1, 'Memory foam; mesh cover; fits airplane seats.'),

  -- Toiletries
  (401, 'Silicone Travel Bottles (5)',  4,   14.00,   90, 1, 'Leak-proof, 100ml each, TSA-friendly.'),
  (402, 'Hanging Toiletry Bag',         4,   42.00,  280, 1, 'Three sections; hook + handle.'),
  (403, 'Solid Shampoo Bar',            4,   12.00,   95, 1, 'Pulp-free, 80+ washes, plastic-free packaging.'),
  (404, 'Microfiber Towel',             4,   24.00,  180, 1, 'Quick-dry; antimicrobial; folds to phone size.'),
  (405, 'Reusable Razor + 5 Blades',    4,   34.00,  110, 1, 'Brass handle; safety razor.'),
  (406, 'Insulated Water Bottle',       4,   28.00,  330, 1, '500ml; double-walled; bamboo cap.'),

  -- Apparel
  (501, 'Merino T-Shirt',               5,   78.00,  165, 1, 'Anti-odor, packs flat, wears 5+ days.'),
  (502, 'Packable Rain Jacket',         5,   89.00,  240, 1, 'Folds into its own pocket; sealed seams.'),
  (503, 'Compression Socks',            5,   28.00,   90, 1, '15-20 mmHg; reduces leg swell on long flights.'),
  (504, 'Wide-Brim Sun Hat (Packable)', 5,   36.00,  120, 1, 'UPF 50; chinstrap; foldable.'),
  (505, 'Convertible Pants',            5,   72.00,  340, 1, 'Zip-off legs; ripstop; quick-dry.'),
  (506, 'Travel Scarf with Pocket',     5,   32.00,  140, 1, 'Hidden zip pocket for passport/cards.');

INSERT INTO reviews (product_id, rating, comment, created_at) VALUES
  (101, 5, 'Survived three transatlantic trips, still pristine.',           '2026-02-14'),
  (101, 4, 'Spinner wheels are quiet; lock feels solid.',                   '2026-03-02'),
  (101, 5, 'Right at the carry-on limit, fits IATA sizers.',                '2026-04-08'),
  (102, 4, 'Comfy strap; laptop sleeve fits a 15" easily.',                 '2026-02-20'),
  (102, 5, 'RFID pocket is genuinely useful, not gimmick.',                 '2026-03-19'),
  (103, 5, 'The compression zip is the real deal, saved half my space.',    '2026-02-01'),
  (103, 4, 'Mesh shows wear after a year but still going.',                 '2026-04-12'),
  (104, 4, 'Fits a long weekend; shoe compartment is gold.',                '2026-03-04'),
  (104, 3, 'Strap padding could be thicker for heavy loads.',               '2026-04-21'),
  (105, 5, 'Lifesaver in Iceland rain.',                                    '2026-02-25'),
  (105, 4, 'Wish it came in two sizes.',                                    '2026-03-30'),

  (201, 5, 'Charged my MacBook + phone simultaneously, no fuss.',           '2026-02-08'),
  (201, 4, 'One of the prongs is stiff but functional.',                    '2026-03-15'),
  (201, 5, 'Eight countries in one trip, never reached for another.',       '2026-04-02'),
  (202, 5, 'Topped up the laptop fast, no airline pushback.',               '2026-02-18'),
  (202, 4, 'Heavy-ish but the capacity is worth it.',                       '2026-04-05'),
  (203, 5, 'Cancels engine roar completely, music sounds great.',           '2026-02-11'),
  (203, 5, 'Battery is honest, not optimistic-spec.',                       '2026-03-22'),
  (204, 4, 'Hotel captive portals work first try.',                         '2026-02-27'),
  (204, 3, 'Setup screen is dated but functions are solid.',                '2026-04-14'),
  (205, 4, 'Tidy little kit; cables not the longest.',                      '2026-03-10'),

  (301, 5, 'Finally slept on a redeye, this thing actually works.',         '2026-02-09'),
  (301, 4, 'Strap squeaks a bit when adjusting.',                           '2026-03-28'),
  (302, 5, 'Contoured shape blocks all light without pressing eyes.',       '2026-02-22'),
  (303, 4, 'Saved my back on a 13h flight.',                                '2026-03-06'),
  (303, 3, 'Hooks slip on some tray tables.',                               '2026-04-19'),
  (304, 5, 'Three pairs, three scenarios, all useful.',                     '2026-02-15'),
  (305, 5, 'Surprisingly warm for the weight.',                             '2026-03-11'),
  (306, 4, 'Took the edge off a 10h flight.',                               '2026-04-07'),

  (401, 5, 'Zero leaks across four trips.',                                 '2026-02-04'),
  (401, 4, 'Squeeze action is firm but reliable.',                          '2026-03-18'),
  (402, 4, 'Hook is small but holds the full bag.',                         '2026-02-26'),
  (402, 5, 'Three sections + central pouch is perfect.',                    '2026-04-09'),
  (403, 5, 'Lasted my whole 4-week trip and then some.',                    '2026-02-17'),
  (404, 5, 'Dries fast enough to pack same morning.',                       '2026-03-05'),
  (405, 4, 'Smoother shave than I expected.',                               '2026-04-01'),
  (406, 4, 'Keeps cold drinks cold for 16h.',                               '2026-03-23'),

  (501, 5, 'Five days of wear, no smell. Black magic.',                     '2026-02-13'),
  (501, 4, 'Bit pricey but earns it.',                                      '2026-04-04'),
  (502, 5, 'Sintra downpour, completely dry.',                              '2026-03-08'),
  (502, 3, 'Wish the hood cinched tighter.',                                '2026-04-25'),
  (503, 5, 'No swelling after a 12h flight, first time ever.',              '2026-02-19'),
  (503, 4, 'Tight at the top of the calf, fine after a few minutes.',       '2026-03-29'),
  (504, 5, 'Folds tiny, brim stays crisp.',                                 '2026-04-11'),
  (505, 4, 'Zip-off shorts are surprisingly comfortable.',                  '2026-03-13'),
  (506, 5, 'Passport pocket is hidden well; scarf reads as a scarf.',       '2026-02-28'),

  -- Extra reviews so the default row cap actually truncates the "no
  -- LIMIT" path in tests. Without these the table happened to land at
  -- exactly DEFAULT_LIMIT and truncation never fired.
  (101, 4, 'Wheels handled cobblestones in Lisbon just fine.',              '2026-04-29'),
  (102, 4, 'Front mesh pocket is a great water-bottle home.',               '2026-05-02'),
  (201, 3, 'Plug fit is loose in older European outlets.',                  '2026-05-04'),
  (301, 5, 'Travelled three continents, still my favorite.',                '2026-04-30'),
  (302, 4, 'Strap clip broke after a year of daily use.',                   '2026-05-01'),
  (401, 5, 'Cap design prevents accidental opens in the bag.',              '2026-05-03'),
  (501, 5, 'Bought a second one immediately.',                              '2026-04-27'),
  (502, 4, 'Lightweight enough to forget you''re carrying it.',             '2026-04-28'),
  (503, 5, 'Wearing them for the next long flight too.',                    '2026-05-05'),
  (506, 4, 'Wish there was a darker color option.',                         '2026-05-06');
