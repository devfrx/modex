<script setup lang="ts">
import { ref, computed } from "vue";
import { Doughnut, Bar, Line, PolarArea, Radar, Pie } from "vue-chartjs";
import {
    Circle,
    BarChart3,
    TrendingUp,
    Hexagon,
    Target,
    PieChart,
    Maximize2,
    Minimize2,
    Settings,
    GripVertical,
} from "lucide-vue-next";

const props = defineProps<{
    title: string;
    icon?: any;
    chartTypes: readonly string[];
    data: any;
    defaultType?: string;
    colors: string[];
    backgroundColors: string[];
}>();

const emit = defineEmits<{
    (e: "expand"): void;
}>();

const currentType = ref(props.defaultType || props.chartTypes[0]);
const isExpanded = ref(false);

const chartComponents: Record<string, any> = {
    doughnut: Doughnut,
    bar: Bar,
    line: Line,
    polar: PolarArea,
    radar: Radar,
    pie: Pie,
};

const chartIcons: Record<string, any> = {
    doughnut: Circle,
    bar: BarChart3,
    line: TrendingUp,
    polar: Target,
    radar: Hexagon,
    pie: PieChart,
};

const chartData = computed(() => {
    const baseData = { ...props.data };

    if (baseData.datasets && baseData.datasets.length > 0) {
        baseData.datasets = baseData.datasets.map((dataset: any) => ({
            ...dataset,
            backgroundColor: currentType.value === "line"
                ? `${props.colors[0]}33`
                : props.backgroundColors.slice(0, baseData.labels?.length || props.backgroundColors.length),
            borderColor: currentType.value === "line"
                ? props.colors[0]
                : props.colors.slice(0, baseData.labels?.length || props.colors.length),
            borderWidth: 2,
            fill: currentType.value === "line",
            tension: currentType.value === "line" ? 0.4 : undefined,
        }));
    }

    return baseData;
});

const doughnutOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: "bottom" as const,
            labels: {
                color: "rgba(255,255,255,0.7)",
                padding: 15,
                usePointStyle: true,
            },
        },
        tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 12,
            cornerRadius: 8,
        },
    },
    cutout: "60%",
}));

const barOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 12,
            cornerRadius: 8,
        },
    },
    scales: {
        x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "rgba(255,255,255,0.5)" },
        },
        y: {
            grid: { display: false },
            ticks: { color: "rgba(255,255,255,0.7)" },
        },
    },
}));

const lineOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 12,
            cornerRadius: 8,
        },
    },
    scales: {
        x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "rgba(255,255,255,0.5)" },
        },
        y: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "rgba(255,255,255,0.7)" },
        },
    },
}));

const radarOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 12,
            cornerRadius: 8,
        },
    },
    scales: {
        r: {
            grid: { color: "rgba(255,255,255,0.1)" },
            angleLines: { color: "rgba(255,255,255,0.1)" },
            ticks: { display: false },
            pointLabels: { color: "rgba(255,255,255,0.7)" },
        },
    },
}));

const polarOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: "bottom" as const,
            labels: {
                color: "rgba(255,255,255,0.7)",
                padding: 15,
                usePointStyle: true,
            },
        },
        tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 12,
            cornerRadius: 8,
        },
    },
    scales: {
        r: {
            grid: { color: "rgba(255,255,255,0.1)" },
            ticks: { display: false },
        },
    },
}));

const chartOptions = computed(() => {
    const optionsMap: Record<string, any> = {
        doughnut: doughnutOptions.value,
        pie: doughnutOptions.value,
        bar: barOptions.value,
        line: lineOptions.value,
        radar: radarOptions.value,
        polar: polarOptions.value,
    };
    return optionsMap[currentType.value] || barOptions.value;
});
</script>

<template>
    <div class="rounded-2xl border border-border bg-card p-5 hover:shadow-lg transition-shadow group"
        :class="{ 'col-span-2': isExpanded }">
        <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold flex items-center gap-2">
                <component :is="icon" v-if="icon" class="w-4 h-4 text-primary" />
                {{ title }}
            </h3>

            <div class="flex items-center gap-2">
                <!-- Chart Type Selector -->
                <div class="flex gap-1 p-1 bg-muted/50 rounded-lg">
                    <button v-for="type in chartTypes" :key="type" @click="currentType = type"
                        class="px-2.5 py-1 text-xs rounded-md transition-all flex items-center justify-center" :class="currentType === type
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'hover:bg-muted/80 text-muted-foreground'" :title="type.charAt(0).toUpperCase() + type.slice(1)">
                        <component :is="chartIcons[type] || BarChart3" class="w-3.5 h-3.5" />
                    </button>
                </div>

                <!-- Expand Button -->
                <button @click="isExpanded = !isExpanded"
                    class="p-1.5 rounded-md hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
                    :title="isExpanded ? 'Collapse' : 'Expand'">
                    <Maximize2 v-if="!isExpanded" class="w-4 h-4" />
                    <Minimize2 v-else class="w-4 h-4" />
                </button>
            </div>
        </div>

        <div :class="isExpanded ? 'h-[400px]' : 'h-[300px]'">
            <component :is="chartComponents[currentType] || Bar" :data="chartData" :options="chartOptions" />
        </div>
    </div>
</template>
