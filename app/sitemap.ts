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
    {
      url: "https://ap-academy-landing.vercel.app/sat",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://ap-academy-landing.vercel.app/sat/quiz",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
