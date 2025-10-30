"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export const description = "気温と降水確率の複数折れ線グラフ";

interface ChartLineMultipleProps {
  chartData: { time: string; temp: number; pop: number }[];
}

const chartConfig = {
  temp: {
    label: "気温 (°C)",
    color: "var(--chart-temp)",
  },
  pop: {
    label: "降水確率 (%)",
    color: "var(--chart-pop)",
  },
} satisfies ChartConfig;

export function ChartLineMultiple({ chartData }: ChartLineMultipleProps) {
  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>24時間予報</CardTitle>
        <CardDescription>3時間ごとの気温と降水確率</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig}>
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 12, right: 12, top: 16, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                yAxisId="temp"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                width={40}
                tickFormatter={(value: number) => `${value}°`}
                tick={{ fill: "var(--chart-temp)" }}
              />
              <YAxis
                yAxisId="pop"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                width={40}
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tick={{ fill: "var(--chart-pop)" }}
              />
              <ChartTooltip
                cursor={{ strokeDasharray: "4 4" }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, name) => (
                      <div className="flex flex-1 items-center justify-between leading-none">
                        <span className="text-muted-foreground">
                          {chartConfig[name as keyof typeof chartConfig]
                            ?.label || name}
                        </span>
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          {name === "temp"
                            ? `${Number(value).toFixed(1)}°C`
                            : `${Math.round(Number(value))}%`}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="temp"
                yAxisId="temp"
                type="monotone"
                stroke="var(--color-temp)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                dataKey="pop"
                yAxisId="pop"
                type="monotone"
                stroke="var(--color-pop)"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">
            予報データを取得できませんでした。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
