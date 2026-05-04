import { NextRequest } from "next/server";
import { GET } from "@/app/api/reps/route";

const response = await GET(
  new NextRequest("http://localhost/api/reps?zip=10001")
);

console.log(await response.text());
