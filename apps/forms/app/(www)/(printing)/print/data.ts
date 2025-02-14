export namespace wwwprint {
  export type TemplateCategory = {
    id: number;
    name: string;
    description: string;
    image: string;
  };

  export const categories: TemplateCategory[] = [
    {
      id: 1,
      name: "Leaflet",
      description: "Create professional documents with ease.",
      image: "/www/.print/categories/01.png",
    },
    {
      id: 2,
      name: "Menu",
      description:
        "Collaborate visually with brainstorming and planning tools.",
      image: "/www/.print/categories/02.png",
    },
    {
      id: 3,
      name: "Beverage",
      description: "Design engaging slides for meetings and events.",
      image: "/www/.print/categories/03.png",
    },
    {
      id: 4,
      name: "Snack",
      description: "Craft unique logos for your brand or business.",
      image: "/www/.print/categories/04.png",
    },
    {
      id: 5,
      name: "Tag",
      description: "Edit and create stunning video content.",
      image: "/www/.print/categories/05.png",
    },
    {
      id: 7,
      name: "Carton",
      description: "Visualize data and information effectively.",
      image: "/www/.print/categories/06.png",
    },
    {
      id: 8,
      name: "Box Case",
      description: "Create sleek and professional business cards.",
      image: "/www/.print/categories/07.png",
    },
    {
      id: 9,
      name: "wrapping paper",
      description: "Design custom apparel with unique graphics.",
      image: "/www/.print/categories/08.png",
    },
    {
      id: 10,
      name: "Cigar",
      description: "Engage your audience with stylish story templates.",
      image: "/www/.print/categories/09.png",
    },
    {
      id: 11,
      name: "Book",
      description: "Create eye-catching posts for social media.",
      image: "/www/.print/categories/11.png",
    },
    {
      id: 12,
      name: "Banner",
      description: "Build impressive resumes that stand out.",
      image: "/www/.print/categories/12.png",
    },
    {
      id: 13,
      name: "Brochures",
      description: "Inform and promote with well-designed brochures.",
      image: "/www/.print/categories/13.png",
    },
    {
      id: 14,
      name: "Desktop Wallpapers",
      description: "Customize your desktop with stunning backgrounds.",
      image: "/www/.print/categories/14.png",
    },
    {
      id: 15,
      name: "Roll label",
      description: "Design book covers that captivate readers.",
      image: "/www/.print/categories/15.png",
    },
    {
      id: 16,
      name: "Sticker",
      description: "Maintain a professional look for official documents.",
      image: "/www/.print/categories/16.png",
    },
    {
      id: 17,
      name: "Pen",
      description: "Create stunning visuals for music albums.",
      image: "/www/.print/categories/17.png",
    },
    {
      id: 18,
      name: "T-shirts",
      description: "Advertise events and products with eye-catching posters.",
      image: "/www/.print/categories/18.png",
    },
    {
      id: 19,
      name: "Photo",
      description: "Design beautiful invitations for special occasions.",
      image: "/www/.print/categories/19.png",
    },
    {
      id: 20,
      name: "Paper bag",
      description: "Promote events and businesses with custom flyers.",
      image: "/www/.print/categories/20.png",
    },
    {
      id: 21,
      name: "Packaging paper",
      description: "Create personalized gift certificates for any occasion.",
      image: "/www/.print/categories/21.png",
    },
  ];

  export const materials = [
    {
      id: 1,
      name: "Premium Matte Paper",
      description:
        "Smooth, non-glossy finish ideal for vibrant colors and sharp text.",
      image: "/www/.print/materials/01.png",
      properties: ["220 gsm", "Acid-free", "Archival quality"],
    },
    {
      id: 2,
      name: "Glossy Photo Paper",
      description:
        "High-shine finish for vivid photo reproductions and posters.",
      image: "/www/.print/materials/02.png",
      properties: ["260 gsm", "Water-resistant", "Instant dry"],
    },
    {
      id: 3,
      name: "Textured Canvas",
      description:
        "Artist-grade canvas for fine art reproductions and photo prints.",
      image: "/www/.print/materials/03.png",
      properties: ["400 gsm", "Acid-free", "Stretchable"],
    },
    {
      id: 4,
      name: "Recycled Kraft Paper",
      description: "Eco-friendly option with a unique, natural texture.",
      image: "/www/.print/materials/04.png",
      properties: ["300 gsm", "100% recycled", "Biodegradable"],
    },
    {
      id: 5,
      name: "Translucent Vellum",
      description:
        "Semi-transparent paper for layering and creative print projects.",
      image: "/www/.print/materials/05.png",
      properties: ["80 gsm", "Acid-free", "Smooth finish"],
    },
    {
      id: 6,
      name: "Metallic Foil Paper",
      description:
        "Shimmering metallic finish for luxury invitations and cards.",
      image: "/www/.print/materials/06.png",
      properties: ["120 gsm", "Acid-free", "Metallic finish"],
    },
    {
      id: 7,
      name: "Adhesive Vinyl",
      description:
        "Durable, weatherproof vinyl for stickers, decals, and labels.",
      image: "/www/.print/materials/07.png",
      properties: ["100 micron", "Waterproof", "UV-resistant"],
    },
    {
      id: 8,
      name: "Magnetic Sheet",
      description:
        "Flexible magnetic sheet for fridge magnets and promotional items.",
      image: "/www/.print/materials/08.png",
      properties: ["0.5 mm", "Magnetic", "Printable"],
    },
    {
      id: 9,
      name: "Acrylic Plexiglass",
      description:
        "Clear, durable plexiglass for signs, displays, and photo mounting.",
      image: "/www/.print/materials/09.png",
      properties: ["3 mm", "Lightweight", "Impact-resistant"],
    },
    {
      id: 10,
      name: "Corrugated Cardboard",
      description:
        "Sturdy, lightweight cardboard for packaging and shipping boxes.",
      image: "/www/.print/materials/10.png",
      properties: ["3 mm", "Recyclable", "Shock-absorbent"],
    },
    {
      id: 11,
      name: "Fabric Canvas",
      description:
        "Polyester canvas with a fabric texture for banners and displays.",
      image: "/www/.print/materials/11.png",
      properties: ["220 gsm", "Waterproof", "Tear-resistant"],
    },
    {
      id: 12,
      name: "Wooden Board",
      description:
        "Natural wood board for rustic signs, decorations, and wall art.",
      image: "/www/.print/materials/12.png",
      properties: ["5 mm", "Sustainable", "Eco-friendly"],
    },
    {
      id: 13,
      name: "Metal Aluminum",
      description:
        "Brushed aluminum sheet for industrial signs and outdoor displays.",
      image: "/www/.print/materials/13.png",
      properties: ["1 mm", "Weatherproof", "Rust-resistant"],
    },
  ];

  export interface Template {
    id: number;
    category: string;
    name: string;
    image: string;
    price: number;
    step: number;
    properties: {
      material: number;
      size: { width: number; height: number };
    };
  }

  export const templates: Template[] = [
    {
      id: 1,
      name: "Leaflet",
      category: "Printing",
      image: "/www/.print/categories/01.png",
      price: 25,
      step: 1,
      properties: {
        material: 1,
        size: { width: 98, height: 24 },
      },
    },
    {
      id: 2,
      name: "Menu",
      category: "Printing",
      image: "/www/.print/categories/02.png",
      price: 25,
      step: 1,
      properties: {
        material: 1,
        size: { width: 23.5, height: 22 },
      },
    },
    {
      id: 3,
      name: "Beverage",
      category: "Packaging",
      image: "/www/.print/categories/03.png",
      price: 25,
      step: 1,
      properties: {
        material: 1,
        size: { width: 35, height: 42 },
      },
    },
    {
      id: 4,
      name: "Cigar",
      category: "Printing",
      image: "/www/.print/categories/09.png",
      price: 25,
      step: 1,
      properties: {
        material: 3,
        size: { width: 95, height: 29 },
      },
    },
    {
      id: 5,
      name: "Tag",
      category: "Printing",
      image: "/www/.print/categories/05.png",
      price: 25,
      step: 1,
      properties: {
        material: 2,
        size: { width: 15, height: 93 },
      },
    },
    {
      id: 6,
      name: "Carton",
      category: "Packaging",
      image: "/www/.print/categories/06.png",
      price: 25,
      step: 1,
      properties: {
        material: 4,
        size: { width: 235, height: 224 },
      },
    },
    {
      id: 7,
      name: "Gift box",
      category: "Packaging",
      image: "/www/.print/categories/07.png",
      price: 25,
      step: 1,
      properties: {
        material: 4,
        size: { width: 3.5, height: 2 },
      },
    },
    {
      id: 8,
      name: "Business card",
      category: "Printing",
      image: "/www/.print/categories/10.png",
      price: 25,
      step: 1,
      properties: {
        material: 3,
        size: { width: 3.5, height: 2 },
      },
    },
  ];

  export const faqs = [
    {
      question: "What products can I print with your service?",
      answer:
        "We offer high-quality printing for business cards, brochures, flyers, posters, labels, and more. Our printing services are tailored for business owners, including cigar brands in Nicaragua, looking for fast and precise printing. Visit our catalog to see all available products.",
    },
    {
      question: "How fast can I receive my printed products?",
      answer:
        "We offer express shipping from South Korea, which is often faster than using US or Canada-based printers. Our estimated delivery times are:\n\n- Express: 5-7 business days (including printing and shipping time)\n- Standard: 10-14 business days\n\nDelivery times may vary based on customs clearance and local logistics.",
    },
    {
      question: "Why do you print in South Korea?",
      answer:
        "South Korea offers the fastest and most accurate printing technology, ensuring superior quality and precision. Even with international shipping, our service is often **faster than US or Canada-based printing services**, making it the best option for businesses in Nicaragua.",
    },
    {
      question: "How much does shipping cost?",
      answer:
        "We offer competitive shipping rates based on the order size and urgency:\n\n- Express Shipping: Calculated at checkout based on your location\n- Standard Shipping: Free for bulk orders\n\nAll shipping includes tracking so you can monitor your order’s progress.",
    },
    {
      question: "Can I pick up my order locally in Nicaragua?",
      answer:
        "Currently, we do not offer local pickup in Nicaragua, as all orders are shipped directly from South Korea. However, our express shipping ensures that you receive your products faster than most local or North American printing services.",
    },
    {
      question:
        "What file specifications should I follow for the best print quality?",
      answer:
        "For the highest print quality, please ensure your files meet these requirements:\n\n- Minimum resolution: **300 DPI**\n- File formats: **PDF, PNG, JPG, or AI**\n- Color mode: **CMYK**\n- Bleed area: **3mm (0.125 inches) on all sides**\n\nWe also offer automated proofing to check your design for any issues before printing.",
    },
    {
      question: "What if there’s an issue with my order?",
      answer:
        "We stand by our **quality guarantee**. If there is any defect in your printed product, please contact our support team within **7 days of receiving your order**, and we will reprint or refund your order as needed. Our goal is 100% customer satisfaction.",
    },
    {
      question: "Do you offer custom printing for cigar brands in Nicaragua?",
      answer:
        "Yes! We specialize in **custom printing for cigar brands**, offering premium packaging, labels, and promotional materials. Our precise printing ensures that your brand stands out with high-quality finishes.",
    },
    {
      question: "How do I place an order?",
      answer:
        "Ordering is simple:\n\n1. Choose a product and upload your design.\n2. Select your preferred material and quantity.\n3. Review your order and confirm shipping details.\n4. Make a payment, and we’ll handle the rest!\n\nYour order will be printed in South Korea and shipped to Nicaragua with tracking.",
    },
  ];
}
