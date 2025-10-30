import React from "react";
import { SectionCards } from "@/components/section-cards";

export default function App() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="w-full max-w-7xl px-4 mx-auto md:px-8 lg:max-w-[1440px]">
        <div className="flex flex-col gap-4 py-6 md:gap-6 md:py-6">
          <SectionCards />
        </div>
      </div>
    </div>
  );
}
