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
      name: "Docs",
      description: "Create professional documents with ease.",
      image: "/www/.print/categories/01.png",
    },
    {
      id: 2,
      name: "Whiteboards",
      description:
        "Collaborate visually with brainstorming and planning tools.",
      image: "/www/.print/categories/02.png",
    },
    {
      id: 3,
      name: "Presentations",
      description: "Design engaging slides for meetings and events.",
      image: "/www/.print/categories/03.png",
    },
    {
      id: 4,
      name: "Logos",
      description: "Craft unique logos for your brand or business.",
      image: "/www/.print/categories/04.png",
    },
    {
      id: 5,
      name: "Videos",
      description: "Edit and create stunning video content.",
      image: "/www/.print/categories/05.png",
    },
    {
      id: 7,
      name: "Infographics",
      description: "Visualize data and information effectively.",
      image: "/www/.print/categories/06.png",
    },
    {
      id: 8,
      name: "Business Cards",
      description: "Create sleek and professional business cards.",
      image: "/www/.print/categories/07.png",
    },
    {
      id: 9,
      name: "T-Shirts",
      description: "Design custom apparel with unique graphics.",
      image: "/www/.print/categories/08.png",
    },
    {
      id: 10,
      name: "Instagram Stories",
      description: "Engage your audience with stylish story templates.",
      image: "/www/.print/categories/09.png",
    },
    {
      id: 11,
      name: "Instagram Posts",
      description: "Create eye-catching posts for social media.",
      image: "/www/.print/categories/11.png",
    },
    {
      id: 12,
      name: "Resumes",
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
      name: "Book Covers",
      description: "Design book covers that captivate readers.",
      image: "/www/.print/categories/15.png",
    },
    {
      id: 16,
      name: "Letterheads",
      description: "Maintain a professional look for official documents.",
      image: "/www/.print/categories/16.png",
    },
    {
      id: 17,
      name: "Album Covers",
      description: "Create stunning visuals for music albums.",
      image: "/www/.print/categories/17.png",
    },
    {
      id: 18,
      name: "Posters",
      description: "Advertise events and products with eye-catching posters.",
      image: "/www/.print/categories/18.png",
    },
    {
      id: 19,
      name: "Invitations",
      description: "Design beautiful invitations for special occasions.",
      image: "/www/.print/categories/19.png",
    },
    {
      id: 20,
      name: "Flyers",
      description: "Promote events and businesses with custom flyers.",
      image: "/www/.print/categories/20.png",
    },
    {
      id: 21,
      name: "Gift Certificates",
      description: "Create personalized gift certificates for any occasion.",
      image: "/www/.print/categories/21.png",
    },
    {
      id: 22,
      name: "Menus",
      description: "Design mouth-watering menus for restaurants and cafes.",
      image: "/www/.print/categories/22.png",
    },
  ];

  export const materials = [
    {
      id: 1,
      name: "A",
      image: "/www/.print/materials/01.png",
    },
    {
      id: 2,
      name: "B",
      image: "/www/.print/materials/02.png",
    },
    {
      id: 3,
      name: "C",
      image: "/www/.print/materials/03.png",
    },
    {
      id: 4,
      name: "D",
      image: "/www/.print/materials/04.png",
    },
    {
      id: 5,
      name: "D",
      image: "/www/.print/materials/05.png",
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
      name: "Business Card",
      category: "Business",
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
      name: "Wedding Invitation",
      category: "Personal",
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
      name: "Flyer",
      category: "Marketing",
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
      name: "Brochure",
      category: "Marketing",
      image: "/www/.print/categories/04.png",
      price: 25,
      step: 1,
      properties: {
        material: 3,
        size: { width: 95, height: 29 },
      },
    },
    {
      id: 5,
      name: "Resume",
      category: "Personal",
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
      name: "Menu",
      category: "Business",
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
      name: "Postcard",
      category: "Marketing",
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
      name: "Poster",
      category: "Marketing",
      image: "/www/.print/categories/08.png",
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
