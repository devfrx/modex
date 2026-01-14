<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
    X,
    ChevronLeft,
    ChevronRight,
    Key,
    Users,
    Upload,
    Download,
    Globe,
    Github,
    Settings,
    Link,
    Play,
    CheckCircle2,
    ExternalLink,
    Sparkles,
    BookOpen,
    Rocket,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import ModexLogo from "@/assets/modex_logo_h2_nobg.png";

const props = defineProps<{
    open: boolean;
    /** If true, the "don't show again" checkbox is hidden (used when opened from Guide) */
    hideDoNotShowAgain?: boolean;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const router = useRouter();
const currentStep = ref(0);
const dontShowAgain = ref(false);

const WALKTHROUGH_STORAGE_KEY = "modex:walkthrough:dismissed";

// Define the walkthrough steps
const steps = [
    {
        id: "welcome",
        title: "Benvenuto in ModEx!",
        icon: Sparkles,
        color: "text-primary",
        bgColor: "bg-primary/10",
    },
    {
        id: "api-key",
        title: "1. API Key CurseForge",
        icon: Key,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
    },
    {
        id: "github-token",
        title: "2. Token GitHub (opzionale)",
        icon: Github,
        color: "text-purple-500",
        bgColor: "bg-purple-500/10",
    },
    {
        id: "host-flow",
        title: "3a. Sei un Host?",
        icon: Upload,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
    },
    {
        id: "client-flow",
        title: "3b. Sei un Client?",
        icon: Download,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
    },
    {
        id: "done",
        title: "Tutto pronto!",
        icon: Rocket,
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
    },
];

const currentStepData = computed(() => steps[currentStep.value]);
const isFirstStep = computed(() => currentStep.value === 0);
const isLastStep = computed(() => currentStep.value === steps.length - 1);
const progress = computed(() => ((currentStep.value + 1) / steps.length) * 100);

function nextStep() {
    if (!isLastStep.value) {
        currentStep.value++;
    }
}

function prevStep() {
    if (!isFirstStep.value) {
        currentStep.value--;
    }
}

function goToStep(index: number) {
    currentStep.value = index;
}

function handleClose() {
    if (dontShowAgain.value) {
        localStorage.setItem(WALKTHROUGH_STORAGE_KEY, "true");
    }
    currentStep.value = 0;
    emit("close");
}

function goToSettings() {
    handleClose();
    router.push("/settings");
}

function goToGuide() {
    handleClose();
    router.push("/guide");
}

function openCurseForgeConsole() {
    window.open("https://console.curseforge.com/", "_blank");
}

function openGitHubTokens() {
    window.open("https://github.com/settings/tokens", "_blank");
}

onMounted(() => {
    currentStep.value = 0;
});
</script>

<template>
    <Teleport to="body">
        <Transition name="modal">
            <div v-if="open" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="handleClose" />

                <!-- Modal -->
                <div
                    class="relative w-full max-w-2xl max-h-[90vh] bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col">
                    <!-- Header with progress -->
                    <div class="relative">
                        <!-- Progress bar -->
                        <div class="absolute top-0 left-0 right-0 h-1 bg-muted">
                            <div class="h-full bg-primary transition-all duration-300 ease-out"
                                :style="{ width: `${progress}%` }" />
                        </div>

                        <div class="flex items-center justify-between p-4 pt-5">
                            <!-- Step indicator -->
                            <div class="flex items-center gap-2">
                                <div :class="[currentStepData.bgColor, 'p-2 rounded-lg']">
                                    <component :is="currentStepData.icon" :class="['w-5 h-5', currentStepData.color]" />
                                </div>
                                <div>
                                    <h2 class="text-lg font-bold">{{ currentStepData.title }}</h2>
                                    <p class="text-xs text-muted-foreground">Step {{ currentStep + 1 }} di {{
                                        steps.length }}</p>
                                </div>
                            </div>

                            <!-- Close button -->
                            <button @click="handleClose"
                                class="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                                <X class="w-5 h-5" />
                            </button>
                        </div>

                        <!-- Step dots -->
                        <div class="flex justify-center gap-1.5 pb-3">
                            <button v-for="(step, index) in steps" :key="step.id" @click="goToStep(index)" :class="[
                                'w-2 h-2 rounded-full transition-all duration-200',
                                index === currentStep
                                    ? 'bg-primary w-6'
                                    : index < currentStep
                                        ? 'bg-primary/50'
                                        : 'bg-muted-foreground/30'
                            ]" />
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="flex-1 overflow-y-auto p-6">
                        <!-- Welcome Step -->
                        <div v-if="currentStepData.id === 'welcome'" class="space-y-6">
                            <div class="text-center">
                                <img :src="ModexLogo" alt="ModEx" class="h-16 mx-auto mb-4" />
                                <p class="text-muted-foreground">
                                    Questa guida ti aiuterà a configurare ModEx in pochi minuti.
                                </p>
                            </div>

                            <div class="grid gap-4">
                                <div class="p-4 rounded-xl bg-muted/30 border border-border/50">
                                    <h3 class="font-semibold flex items-center gap-2 mb-2">
                                        <Key class="w-4 h-4 text-amber-500" />
                                        API Key CurseForge
                                    </h3>
                                    <p class="text-sm text-muted-foreground">
                                        <strong>Obbligatoria.</strong> Necessaria per cercare e scaricare mod da
                                        CurseForge.
                                    </p>
                                </div>

                                <div class="p-4 rounded-xl bg-muted/30 border border-border/50">
                                    <h3 class="font-semibold flex items-center gap-2 mb-2">
                                        <Github class="w-4 h-4 text-purple-500" />
                                        Token GitHub
                                    </h3>
                                    <p class="text-sm text-muted-foreground">
                                        <strong>Opzionale.</strong> Solo se vuoi condividere modpack con altri giocatori
                                        via Gist.
                                    </p>
                                </div>

                                <div class="p-4 rounded-xl bg-muted/30 border border-border/50">
                                    <h3 class="font-semibold flex items-center gap-2 mb-2">
                                        <Users class="w-4 h-4 text-blue-500" />
                                        Host o Client?
                                    </h3>
                                    <p class="text-sm text-muted-foreground">
                                        Impara come <strong>condividere</strong> o <strong>ricevere</strong> modpack.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- API Key Step -->
                        <div v-else-if="currentStepData.id === 'api-key'" class="space-y-5">
                            <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                                <p class="text-sm text-amber-200">
                                    <strong> Importante:</strong> Senza API Key, ModEx non può cercare mod su
                                    CurseForge.
                                </p>
                            </div>

                            <div class="space-y-4">
                                <h3 class="font-semibold text-lg">Come ottenere l'API Key:</h3>

                                <ol class="space-y-3">
                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center">1</span>
                                        <div>
                                            <p class="font-medium">Vai su CurseForge Console</p>
                                            <button @click="openCurseForgeConsole"
                                                class="text-sm text-primary hover:underline flex items-center gap-1 mt-1">
                                                console.curseforge.com
                                                <ExternalLink class="w-3 h-3" />
                                            </button>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center">2</span>
                                        <div>
                                            <p class="font-medium">Accedi o crea un account</p>
                                            <p class="text-sm text-muted-foreground">Puoi usare Twitch, Google o email.
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center">3</span>
                                        <div>
                                            <p class="font-medium">Vai su "API Keys" nel menu</p>
                                            <p class="text-sm text-muted-foreground">Clicca "Create API Key" e dai un
                                                nome (es. "ModEx").</p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center">4</span>
                                        <div>
                                            <p class="font-medium">Copia la chiave generata</p>
                                            <p class="text-sm text-muted-foreground">Inizia con <code
                                                    class="px-1.5 py-0.5 bg-muted rounded text-xs">$2a$10$...</code></p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center">5</span>
                                        <div>
                                            <p class="font-medium">Incollala in ModEx</p>
                                            <p class="text-sm text-muted-foreground">
                                                Vai in <strong>Impostazioni → Generale → API Configuration</strong>
                                            </p>
                                        </div>
                                    </li>
                                </ol>
                            </div>

                            <Button variant="outline" class="w-full gap-2" @click="goToSettings">
                                <Settings class="w-4 h-4" />
                                Apri Impostazioni
                            </Button>
                        </div>

                        <!-- GitHub Token Step -->
                        <div v-else-if="currentStepData.id === 'github-token'" class="space-y-5">
                            <div class="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
                                <p class="text-sm text-purple-200">
                                    <strong> Opzionale:</strong> Necessario solo se vuoi pubblicare modpack su GitHub
                                    Gist per
                                    condividerli.
                                </p>
                            </div>

                            <div class="space-y-4">
                                <h3 class="font-semibold text-lg">Come ottenere il Token GitHub:</h3>

                                <ol class="space-y-3">
                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-sm font-bold flex items-center justify-center">1</span>
                                        <div>
                                            <p class="font-medium">Vai su GitHub Settings</p>
                                            <button @click="openGitHubTokens"
                                                class="text-sm text-purple-400 hover:underline flex items-center gap-1 mt-1">
                                                github.com/settings/tokens
                                                <ExternalLink class="w-3 h-3" />
                                            </button>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-sm font-bold flex items-center justify-center">2</span>
                                        <div>
                                            <p class="font-medium">Genera un nuovo token (Classic)</p>
                                            <p class="text-sm text-muted-foreground">"Generate new token" → "Classic"
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-sm font-bold flex items-center justify-center">3</span>
                                        <div>
                                            <p class="font-medium">Seleziona solo il permesso "gist"</p>
                                            <p class="text-sm text-muted-foreground">È l'unico necessario per ModEx.</p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-sm font-bold flex items-center justify-center">4</span>
                                        <div>
                                            <p class="font-medium">Copia e incolla il token in ModEx</p>
                                            <p class="text-sm text-muted-foreground">
                                                Vai in <strong>Impostazioni → Generale → GitHub Gist</strong>
                                            </p>
                                        </div>
                                    </li>
                                </ol>
                            </div>
                        </div>

                        <!-- Host Flow Step -->
                        <div v-else-if="currentStepData.id === 'host-flow'" class="space-y-5">
                            <div class="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                                <p class="text-sm text-green-200">
                                    <strong> Sei l'Host</strong> se vuoi creare un modpack e condividerlo con i tuoi
                                    amici.
                                </p>
                            </div>

                            <div class="space-y-4">
                                <h3 class="font-semibold text-lg">Come condividere un modpack:</h3>

                                <ol class="space-y-3">
                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-sm font-bold flex items-center justify-center">1</span>
                                        <div>
                                            <p class="font-medium">Crea un modpack</p>
                                            <p class="text-sm text-muted-foreground">
                                                Vai in <strong>Modpacks</strong> → <strong>+ Nuovo Modpack</strong>
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-sm font-bold flex items-center justify-center">2</span>
                                        <div>
                                            <p class="font-medium">Aggiungi le mod che vuoi</p>
                                            <p class="text-sm text-muted-foreground">
                                                Usa il tab <strong>Discover</strong> per cercare e aggiungere mod da
                                                CurseForge.
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-sm font-bold flex items-center justify-center">3</span>
                                        <div>
                                            <p class="font-medium">Vai nel tab "Share"</p>
                                            <p class="text-sm text-muted-foreground">
                                                Nell'editor del modpack, clicca il pulsante <strong>Share</strong>.
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-sm font-bold flex items-center justify-center">4</span>
                                        <div>
                                            <p class="font-medium">Clicca "Create Gist" o "Update Gist"</p>
                                            <p class="text-sm text-muted-foreground">
                                                ModEx pubblicherà il modpack su GitHub Gist.
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-sm font-bold flex items-center justify-center">5</span>
                                        <div>
                                            <p class="font-medium">Condividi l'URL Raw con i tuoi amici</p>
                                            <p class="text-sm text-muted-foreground">
                                                Copia l'URL con il pulsante <strong>Share</strong> e invialo ai tuoi
                                                amici.
                                            </p>
                                        </div>
                                    </li>
                                </ol>

                                <div
                                    class="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground">
                                    <strong> Tip:</strong> Ogni volta che aggiorni il modpack, clicca "Update Gist"
                                    per sincronizzare
                                    le modifiche. I tuoi amici riceveranno automaticamente gli aggiornamenti.
                                </div>
                            </div>
                        </div>

                        <!-- Client Flow Step -->
                        <div v-else-if="currentStepData.id === 'client-flow'" class="space-y-5">
                            <div class="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                                <p class="text-sm text-blue-200">
                                    <strong> Sei un Client</strong> se vuoi ricevere un modpack condiviso da qualcun
                                    altro.
                                </p>
                            </div>

                            <div class="space-y-4">
                                <h3 class="font-semibold text-lg">Come ricevere un modpack:</h3>

                                <ol class="space-y-3">
                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold flex items-center justify-center">1</span>
                                        <div>
                                            <p class="font-medium">Crea un modpack vuoto</p>
                                            <p class="text-sm text-muted-foreground">
                                                Vai in <strong>Modpacks</strong> → <strong>+ Nuovo Modpack</strong>
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold flex items-center justify-center">2</span>
                                        <div>
                                            <p class="font-medium">Vai nel tab "Share"</p>
                                            <p class="text-sm text-muted-foreground">
                                                Nell'editor del modpack, clicca il pulsante <strong>Share</strong>.
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold flex items-center justify-center">3</span>
                                        <div>
                                            <p class="font-medium">Incolla l'URL nella sezione "Subscriber / Client"</p>
                                            <p class="text-sm text-muted-foreground">
                                                Inserisci l'URL Gist Raw che ti ha dato l'Host.
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold flex items-center justify-center">4</span>
                                        <div>
                                            <p class="font-medium">Clicca "Check Now" per sincronizzare</p>
                                            <p class="text-sm text-muted-foreground">
                                                ModEx scaricherà tutte le mod dal modpack remoto.
                                            </p>
                                        </div>
                                    </li>

                                    <li class="flex gap-3">
                                        <span
                                            class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold flex items-center justify-center">5</span>
                                        <div>
                                            <p class="font-medium">Gioca!</p>
                                            <p class="text-sm text-muted-foreground">
                                                Usa il pulsante <strong>Play</strong> per sincronizzare le mod e avviare
                                                Minecraft.
                                            </p>
                                        </div>
                                    </li>
                                </ol>

                                <div
                                    class="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground">
                                    <strong> Tip:</strong> Abilita "Auto-check on startup" per verificare
                                    automaticamente gli
                                    aggiornamenti ogni volta che apri ModEx.
                                </div>
                            </div>
                        </div>

                        <!-- Done Step -->
                        <div v-else-if="currentStepData.id === 'done'" class="space-y-6 text-center">
                            <div
                                class="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <CheckCircle2 class="w-10 h-10 text-emerald-500" />
                            </div>

                            <div>
                                <h3 class="text-xl font-bold mb-2">Configurazione completata!</h3>
                                <p class="text-muted-foreground">
                                    Ora sei pronto per usare ModEx. Buon divertimento con le tue mod!
                                </p>
                            </div>

                            <div class="grid gap-3">
                                <Button variant="default" class="w-full gap-2" @click="handleClose">
                                    <Play class="w-4 h-4" />
                                    Inizia a usare ModEx
                                </Button>

                                <Button variant="outline" class="w-full gap-2" @click="goToGuide">
                                    <BookOpen class="w-4 h-4" />
                                    Leggi la Guida completa
                                </Button>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="p-4 border-t border-border bg-muted/30">
                        <div class="flex items-center justify-between">
                            <!-- Don't show again checkbox -->
                            <label v-if="!hideDoNotShowAgain"
                                class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                                <input type="checkbox" v-model="dontShowAgain"
                                    class="w-4 h-4 rounded border-border bg-background checked:bg-primary checked:border-primary" />
                                Non mostrare più all'avvio
                            </label>
                            <div v-else />

                            <!-- Navigation buttons -->
                            <div class="flex items-center gap-2">
                                <Button v-if="!isFirstStep" variant="ghost" size="sm" @click="prevStep" class="gap-1">
                                    <ChevronLeft class="w-4 h-4" />
                                    Indietro
                                </Button>

                                <Button v-if="!isLastStep" variant="default" size="sm" @click="nextStep" class="gap-1">
                                    Avanti
                                    <ChevronRight class="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
    transition: opacity 0.2s ease;
}

.modal-enter-active>div:last-child,
.modal-leave-active>div:last-child {
    transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-from>div:last-child,
.modal-leave-to>div:last-child {
    transform: scale(0.95);
    opacity: 0;
}
</style>
