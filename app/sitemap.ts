import { MetadataRoute } from "next";
import { STAGES } from "@/content/path";

const BASE = "https://ap-academy-landing.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...STAGES.map((stage) => ({
      url: `${BASE}/path/${stage.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
