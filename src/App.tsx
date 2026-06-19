import * as React from 'react';
import { useState, useEffect, useRef, useTransition } from 'react';
import { 
  Gamepad2, 
  Upload, 
  Download, 
  RefreshCw, 
  Maximize2, 
  Eye, 
  Grid3X3, 
  Sparkles, 
  Palette, 
  Sliders, 
  Layers, 
  HelpCircle, 
  Type, 
  MonitorPlay,
  Heart,
  ChevronRight,
  RotateCcw,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Film,
  Loader2,
  Music
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ColorPalette, ConverterParams, PRESET_PALETTES, SAMPLE_IMAGES, DitherType } from './types';
import { processImage, renderFinalOutput, hexToRgb } from './utils/pixelator';
import JSZip from 'jszip';

// Midi-to-frequency parser for chiptunes
function getFreq(noteName: string): number {
  if (!noteName || noteName.trim() === "") return 0;
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = noteName.match(/^([A-G]#?)(\d)$/);
  if (!match) return 440;
  const name = match[1];
  const octave = parseInt(match[2]);
  const semitones = notes.indexOf(name) + (octave - 4) * 12;
  return 440 * Math.pow(2, semitones / 12);
}

// Retro 8-bit sound chip loop presets (GBC inspired)
const presetMusic: Record<string, { name: string; melody: string[]; bass: string[]; tempo: number }> = {
  'preset-adventure': {
    name: "👑 口袋冒险 (Retro Quest Loop)",
    tempo: 115,
    melody: [
      "G4", "C5", "D5", "E5", "G5", "E5", "D5", "C5",
      "A4", "C5", "D5", "E5", "C5", "A4", "G4", "G4",
      "G4", "C5", "D5", "E5", "G5", "E5", "D5", "C5",
      "A4", "D5", "C5", "B4", "C5", "", "", ""
    ],
    bass: [
      "C3", "C3", "E3", "E3", "F3", "F3", "G3", "G3",
      "C3", "C3", "A2", "A2", "D3", "D3", "G3", "G3",
      "C3", "C3", "E3", "E3", "F3", "F3", "G3", "G3",
      "F3", "F3", "G3", "G3", "C3", "G3", "C4", ""
    ]
  },
  'preset-puzzle': {
    name: "🧩 俄罗斯方块像素版 (Korobeiniki)",
    tempo: 140,
    melody: [
      "E5", "B4", "C5", "D5", "C5", "B4", "A4", "A4",
      "C5", "E5", "D5", "C5", "B4", "C5", "D5", "E5",
      "C5", "A4", "A4", "", "D5", "F5", "A5", "G5", 
      "F5", "E5", "C5", "E5", "D5", "C5", "B4", "C5",
      "D5", "E5", "C5", "A4", "A4", "", "", ""
    ],
    bass: [
      "A2", "E3", "A3", "E3", "D3", "A3", "D4", "A3",
      "C3", "G3", "C4", "G3", "B2", "E3", "B3", "E3",
      "A2", "E3", "A3", "E3", "D3", "A3", "D4", "A3",
      "C3", "G3", "C4", "G3", "B2", "E3", "B3", "E3",
      "A2", "A2", "E3", "E3", "A3", "E3", "A2", ""
    ]
  },
  'preset-cozy': {
    name: "🌸 像素小镇 (Green Hill Lullaby)",
    tempo: 85,
    melody: [
      "E5", "G5", "A5", "G5", "C5", "D5", "E5", "D5",
      "E5", "G5", "A5", "B5", "C6", "B5", "A5", "G5",
      "F5", "A5", "G5", "E5", "D5", "E5", "C5", ""
    ],
    bass: [
      "C3", "G3", "C4", "G3", "F3", "C4", "F4", "C4",
      "C3", "G3", "C4", "G3", "G3", "D4", "G4", "D4",
      "F3", "C4", "F4", "C4", "E3", "B3", "E4", "B3",
      "D3", "A3", "D3", "G3", "C3", "G3", "C4", ""
    ]
  }
};

// Pure Web Audio GBC tone sequencer
class ChiptunePlayer {
  private ctx: AudioContext | null = null;
  private intervalId: any = null;
  private currentStep = 0;
  private tempo = 120;
  private melody: string[];
  private bass: string[];
  public destination: AudioNode | null = null;

  constructor(melody: string[], bass: string[], tempo = 120) {
    this.melody = melody;
    this.bass = bass;
    this.tempo = tempo;
  }

  start(ctx: AudioContext, destination: AudioNode) {
    this.stop();
    this.ctx = ctx;
    this.destination = destination;
    this.currentStep = 0;
    
    const stepDuration = 60 / this.tempo / 2; // eighth notes
    let nextNoteTime = ctx.currentTime;

    const playStep = () => {
      if (!this.ctx || !this.destination) return;
      const now = this.ctx.currentTime;
      while (nextNoteTime < now + 0.1) {
        this.scheduleNotes(nextNoteTime, stepDuration);
        nextNoteTime += stepDuration;
        this.currentStep = (this.currentStep + 1) % Math.max(this.melody.length, this.bass.length);
      }
    };

    playStep();
    this.intervalId = setInterval(playStep, 50);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.ctx = null;
    this.destination = null;
  }

  private scheduleNotes(time: number, stepDuration: number) {
    if (!this.ctx || !this.destination) return;

    // Melody Channel - Pulse wave
    const mNote = this.melody[this.currentStep % this.melody.length];
    if (mNote && mNote !== "") {
      const freq = getFreq(mNote);
      if (freq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);

        // PSG ADSR Envelope
        gain.gain.setValueAtTime(0.04, time); // low volume safe gain
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration - 0.02);

        osc.connect(gain);
        gain.connect(this.destination);

        osc.start(time);
        osc.stop(time + stepDuration - 0.01);
      }
    }

    // Bass Channel - Soft Triangle wave
    const bNote = this.bass[this.currentStep % this.bass.length];
    if (bNote && bNote !== "") {
      const freq = getFreq(bNote);
      if (freq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.07, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 2 - 0.04);

        osc.connect(gain);
        gain.connect(this.destination);

        osc.start(time);
        osc.stop(time + stepDuration * 1.8);
      }
    }

    // Noise Percussion channel on certain steps
    if (this.currentStep % 4 === 0 || this.currentStep % 8 === 6) {
      const isSnare = this.currentStep % 8 === 6;
      const bufferSize = this.ctx.sampleRate * 0.08; 
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isSnare ? 1200 : 7500, time);
      filter.Q.setValueAtTime(2.0, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(isSnare ? 0.015 : 0.008, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + (isSnare ? 0.06 : 0.03));

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.destination);

      noise.start(time);
      noise.stop(time + 0.08);
    }
  }
}

const INITIAL_PARAMS: ConverterParams = {
  resolutionWidth: 160,
  resolutionHeight: 144,
  maintainAspectRatio: true,
  brightness: 0,
  contrast: 15,
  saturation: 10,
  ditherType: 'floyd',
  ditherAmount: 75,
  paletteId: 'dmg_green',
  customColors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  lcdGridStrength: 30,
  scanlineStrength: 10,
  showConsoleLink: false,
  bezelColor: 'dmg',
  textOverlay: 'STAY RETRO. WIN THE GAME!',
  textPosition: 'bottom',
  textBlinkingCursor: true,
  textFontSize: 14,
  dialogueBoxHeight: 32, // default to 32% of screen height
  dialogueBoxPadding: 12, // default horizontal/vertical buffer padding
  dialogueBoxYOffset: 12, // default vertical offset / distance from top/bottom
  powerLedColor: 'red',
  consoleLogoText: 'GAME BOY COLOR',
  consoleTextureAlpha: 30,
  photoScale: 100,
  photoOffsetX: 0,
  photoOffsetY: 0,
  photoFitMode: 'cover',
  textTypewriter: false,
  edgeEnhancement: false
};

export default function App() {
  const [params, setParams] = useState<ConverterParams>(INITIAL_PARAMS);
  const [selectedPalette, setSelectedPalette] = useState<ColorPalette>(PRESET_PALETTES[0]);
  const [imageUrl, setImageUrl] = useState<string>(SAMPLE_IMAGES[0].url);
  const [isProcessing, startTransition] = useTransition();
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'preset' | 'adjust' | 'retro' | 'text'>('preset');
  const [dragActive, setDragActive] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [exportWithConsoleBezel, setExportWithConsoleBezel] = useState(true);

  // Live Photo / Video States
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);

  // Live Photo Soundtrack States
  const [soundtrackChoice, setSoundtrackChoice] = useState<'original' | 'preset-adventure' | 'preset-puzzle' | 'preset-cozy' | 'custom'>('original');
  const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);
  const [customAudioName, setCustomAudioName] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'video' | 'zip'>('video');
  const [exportFpsChoice, setExportFpsChoice] = useState<'original' | 'gbc' | '10fps' | '5fps' | '3fps'>('original');

  const formatTime = (sec: number) => {
    if (isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * videoDuration;
  };

  const getHtmlPowerLedStyle = () => {
    const choice = params.powerLedColor || 'red';
    if (choice === 'off') {
      return 'bg-stone-700 shadow-none border-stone-800';
    }
    if (isProcessing) {
      return 'bg-amber-500 shadow-[0_0_10px_#f59e0b] animate-ping';
    }
    switch (choice) {
      case 'red': return 'bg-red-600 shadow-[0_0_10px_#ef4444] animate-pulse';
      case 'green': return 'bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse';
      case 'blue': return 'bg-[#3b82f6] shadow-[0_0_10px_#3b82f6] animate-pulse';
      case 'orange': return 'bg-orange-500 shadow-[0_0_10px_#f97316] animate-pulse';
      case 'cyan': return 'bg-cyan-400 shadow-[0_0_10px_#22d3ee] animate-pulse';
      default: return 'bg-red-600 shadow-[0_0_10px_#ef4444] animate-pulse';
    }
  };

  const getHtmlBezelTheme = () => {
    const choice = params.bezelColor || 'dmg';
    switch (choice) {
      case 'dmg':
        return {
          wrapper: 'bg-gradient-to-br from-[#d1cfc4] via-[#b7b4a7] to-[#979488] border-b-[14px] border-r-[14px] border-[#5b5952] rounded-[52px]',
          buttonBox: 'bg-[#959389] border-[#5b5952] border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#5b5952]/40',
          powerLabel: 'text-[#888]'
        };
      case 'yellow':
        return {
          wrapper: 'bg-gradient-to-br from-[#fad02c] via-[#e6b012] to-[#b88c0a] border-b-[14px] border-r-[14px] border-[#664d03] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#cca012]',
          powerLabel: 'text-amber-100'
        };
      case 'berry':
        return {
          wrapper: 'bg-gradient-to-br from-[#d43d6a] via-[#bc2551] to-[#8d1b3e] border-b-[14px] border-r-[14px] border-[#5e0a22] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#751633]',
          powerLabel: 'text-pink-200'
        };
      case 'turquoise':
        return {
          wrapper: 'bg-gradient-to-br from-[#00c9d2] via-[#009fa5] to-[#007377] border-b-[14px] border-r-[14px] border-[#003d3f] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#007a82]',
          powerLabel: 'text-teal-200'
        };
      case 'purple':
        return {
          wrapper: 'bg-gradient-to-br from-[#6b52a5] via-[#493775] to-[#2e214d] border-b-[14px] border-r-[14px] border-[#1b1230] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#3b2d5e]',
          powerLabel: 'text-purple-200'
        };
      case 'clear':
        return {
          wrapper: 'bg-white/10 backdrop-blur-md border-b-[14px] border-r-[14px] border-white/25 shadow-[inset_0_4px_24px_rgba(255,255,255,0.3),0_45px_100px_-25px_rgba(0,0,0,0.95)] rounded-[52px]',
          buttonBox: 'bg-neutral-800/40 border-white/20 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-white/30',
          powerLabel: 'text-stone-300'
        };
      case 'orange':
        return {
          wrapper: 'bg-gradient-to-br from-[#ff7e36] via-[#e05a10] to-[#aa3d00] border-b-[14px] border-r-[14px] border-[#6b2500] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#b34000]',
          powerLabel: 'text-orange-100'
        };
      case 'gold':
        return {
          wrapper: 'bg-gradient-to-br from-[#ffd700] via-[#cfa024] to-[#8c6b12] border-b-[14px] border-r-[14px] border-[#59440b] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#a37e1b]',
          powerLabel: 'text-amber-100'
        };
      case 'black':
        return {
          wrapper: 'bg-gradient-to-br from-[#374151] via-[#111827] to-[#030712] border-b-[14px] border-r-[14px] border-[#000000] rounded-[52px]',
          buttonBox: 'bg-[#252627] border-black border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(255,255,255,0.05),inset_-1px_-2px_4px_rgba(0,0,0,0.8),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#1f2937]',
          powerLabel: 'text-gray-400'
        };
      case 'blue':
        return {
          wrapper: 'bg-gradient-to-br from-[#2563eb] via-[#1d4ed8] to-[#1e3a8a] border-b-[14px] border-r-[14px] border-[#132247] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#172554]',
          powerLabel: 'text-blue-200'
        };
      case 'green':
        return {
          wrapper: 'bg-gradient-to-br from-[#10b981] via-[#059669] to-[#064e3b] border-b-[14px] border-r-[14px] border-[#022c22] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#065f46]',
          powerLabel: 'text-emerald-200'
        };
      case 'mint':
        return {
          wrapper: 'bg-gradient-to-br from-[#a7f3d0] via-[#5eead4] to-[#0f766e] border-b-[14px] border-r-[14px] border-[#0d524d] rounded-[52px]',
          buttonBox: 'bg-[#283e3b] border-teal-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#115e59]',
          powerLabel: 'text-teal-100'
        };
      case 'rose':
        return {
          wrapper: 'bg-gradient-to-br from-[#fbcfe8] via-[#f472b6] to-[#be185d] border-b-[14px] border-r-[14px] border-[#83103c] rounded-[52px]',
          buttonBox: 'bg-[#3b2b30] border-rose-950 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#9d174d]',
          powerLabel: 'text-rose-100'
        };
      default:
        return {
          wrapper: 'bg-gradient-to-br from-[#d43d6a] via-[#bc2551] to-[#8d1b3e] border-b-[14px] border-r-[14px] border-[#5e0a22] rounded-[52px]',
          buttonBox: 'bg-[#2a2b2e] border-neutral-900 border-b-2 border-r-2 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.5),3px_3px_0_-1px_rgba(0,0,0,0.4)]',
          topLine: 'bg-[#751633]',
          powerLabel: 'text-pink-200'
        };
    }
  };

  // Hidden references for processing
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputAudioRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSynthRef = useRef<ChiptunePlayer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getSupportedMimeType = () => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      return '';
    }
    const types = [
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  };

  // Load and apply processing whenever image URL or parameters update
  useEffect(() => {
    if (mediaType !== 'image') return;
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      if (!active) return;
      imageRef.current = img;
      triggerPixelation();
    };
    return () => {
      active = false;
    };
  }, [imageUrl, params, selectedPalette, mediaType]);

  // Video continuous playback synchronization
  useEffect(() => {
    if (videoRef.current) {
      if (videoPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [videoPlaying, videoUrl, mediaType]);

  useEffect(() => {
    if (videoRef.current) {
      if (soundtrackChoice === 'original') {
        videoRef.current.muted = videoMuted;
      } else {
        videoRef.current.muted = true;
      }
    }
  }, [videoMuted, videoUrl, mediaType, soundtrackChoice]);

  // Real-time audio preview controller
  useEffect(() => {
    if (mediaType !== 'video' || !videoUrl || isRecording) {
      if (activeSynthRef.current) {
        activeSynthRef.current.stop();
        activeSynthRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    const triggerPlay = () => {
      // 1. If original sound selected
      if (soundtrackChoice === 'original') {
        if (activeSynthRef.current) {
          activeSynthRef.current.stop();
          activeSynthRef.current = null;
        }
        if (audioRef.current) {
          audioRef.current.pause();
        }
        return;
      }

      // 2. If custom audio selected
      if (soundtrackChoice === 'custom') {
        if (activeSynthRef.current) {
          activeSynthRef.current.stop();
          activeSynthRef.current = null;
        }
        const aud = audioRef.current;
        if (aud) {
          aud.muted = videoMuted;
          if (videoPlaying) {
            aud.play().catch(() => {});
          } else {
            aud.pause();
          }
        }
        return;
      }

      // Pause custom if active
      if (audioRef.current) {
        audioRef.current.pause();
      }

      // 3. If preset synth selected
      const preset = presetMusic[soundtrackChoice];
      if (preset) {
        if (!audioContextRef.current) {
          try {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          } catch (e) {
            console.error("Failed to make preview AudioContext", e);
          }
        }
        const ctx = audioContextRef.current;

        if (ctx) {
          // If muted or paused, stop synth
          if (videoMuted || !videoPlaying) {
            if (activeSynthRef.current) {
              activeSynthRef.current.stop();
              activeSynthRef.current = null;
            }
          } else {
            if (!activeSynthRef.current) {
              const player = new ChiptunePlayer(preset.melody, preset.bass, preset.tempo);
              player.start(ctx, ctx.destination);
              activeSynthRef.current = player;
            }
          }
        }
      }
    };

    triggerPlay();

    return () => {
      if (activeSynthRef.current) {
        activeSynthRef.current.stop();
        activeSynthRef.current = null;
      }
    };
  }, [soundtrackChoice, videoPlaying, videoMuted, videoUrl, mediaType, isRecording]);

  // Real-time video frame rendering loop (representing GBC screen frame processor)
  useEffect(() => {
    if (mediaType !== 'video' || !videoUrl || isRecording) return;

    let animId: number;
    let active = true;
    let lastRenderTime = 0;

    const tick = (timestamp: number) => {
      if (!active) return;
      const v = videoRef.current;
      if (v && !v.paused && !v.ended && v.readyState >= 2) {
        let targetFps = 30;
        if (exportFpsChoice === 'gbc') targetFps = 15;
        else if (exportFpsChoice === '10fps') targetFps = 10;
        else if (exportFpsChoice === '5fps') targetFps = 5;
        else if (exportFpsChoice === '3fps') targetFps = 3;

        const maxFrameInterval = 1000 / targetFps;
        const elapsed = timestamp - lastRenderTime;

        if (elapsed >= maxFrameInterval - 1) { // 1ms tolerance
          lastRenderTime = timestamp;

          const processed = processImage(v, params, selectedPalette);
          const finalCanvas = renderFinalOutput(
            processed, 
            params, 
            selectedPalette, 
            false, 
            v.currentTime, 
            v.duration
          );

          if (outputCanvasContainerRef.current) {
            outputCanvasContainerRef.current.innerHTML = '';
            finalCanvas.className = "w-full max-w-full h-auto object-contain rounded-lg shadow-2xl border border-gray-800 bg-[#16181b]";
            finalCanvas.id = "gb-final-output-canvas";
            outputCanvasContainerRef.current.appendChild(finalCanvas);
            processedCanvasRef.current = finalCanvas;
          }
        }
      } else if (v && (v.paused || v.ended) && v.readyState >= 2) {
        // Redraw immediately when paused to allow interactive updates from sliders/palette swaps
        const processed = processImage(v, params, selectedPalette);
        const finalCanvas = renderFinalOutput(
          processed, 
          params, 
          selectedPalette, 
          false, 
          v.currentTime, 
          v.duration
        );

        if (outputCanvasContainerRef.current) {
          outputCanvasContainerRef.current.innerHTML = '';
          finalCanvas.className = "w-full max-w-full h-auto object-contain rounded-lg shadow-2xl border border-gray-800 bg-[#16181b]";
          finalCanvas.id = "gb-final-output-canvas";
          outputCanvasContainerRef.current.appendChild(finalCanvas);
          processedCanvasRef.current = finalCanvas;
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [mediaType, videoUrl, params, selectedPalette, videoPlaying, isRecording, exportFpsChoice]);

  const triggerPixelation = () => {
    if (!imageRef.current) return;
    
    startTransition(() => {
      // 1. Process pixelation offscreen
      const processed = processImage(imageRef.current!, params, selectedPalette);
      
      // 2. Render console shell bezel and scanline overlays
      const finalCanvas = renderFinalOutput(processed, params, selectedPalette, false);
      
      // Flush to UI viewport container
      if (outputCanvasContainerRef.current) {
        outputCanvasContainerRef.current.innerHTML = '';
        finalCanvas.className = "w-full max-w-full h-auto object-contain rounded-lg shadow-2xl border border-gray-800 bg-[#16181b]";
        finalCanvas.id = "gb-final-output-canvas";
        outputCanvasContainerRef.current.appendChild(finalCanvas);
        processedCanvasRef.current = finalCanvas;
      }
    });
  };

  const startRecordingLivePhoto = async () => {
    if (mediaType !== 'video' || !videoRef.current) return;

    const video = videoRef.current;
    const isPausedBefore = video.paused;

    // Halt and seek back to dynamic start for pristine sync
    video.pause();
    video.currentTime = 0;
    
    setIsRecording(true);
    setRecordProgress(0);

    await new Promise(resolve => setTimeout(resolve, 350));

    const chunks: BlobPart[] = [];
    const mimeType = getSupportedMimeType();

    // Use full offline canvases for flawless frame bundling
    const tempCanvas = document.createElement('canvas');
    const width = exportWithConsoleBezel ? 840 : params.resolutionWidth * 4;
    const height = exportWithConsoleBezel ? 1436 : params.resolutionHeight * 4;
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    const paintFrame = () => {
      if (!tempCtx) return;
      const processed = processImage(video, params, selectedPalette);
      const finalCanvas = renderFinalOutput(
        processed, 
        params, 
        selectedPalette, 
        exportWithConsoleBezel, 
        video.currentTime, 
        video.duration
      );
      tempCtx.clearRect(0, 0, width, height);
      tempCtx.drawImage(finalCanvas, 0, 0);
    };

    paintFrame();

    let exportFps = 30;
    if (exportFpsChoice === 'gbc') exportFps = 15;
    else if (exportFpsChoice === '10fps') exportFps = 10;
    else if (exportFpsChoice === '5fps') exportFps = 5;
    else if (exportFpsChoice === '3fps') exportFps = 3;
    const stream = tempCanvas.captureStream(exportFps);
    
    let recAudioCtx: AudioContext | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;
    let recPlayer: ChiptunePlayer | null = null;
    let recAudioElement: HTMLAudioElement | null = null;

    if (soundtrackChoice === 'original') {
      try {
        const v = videoRef.current;
        if (v) {
          const vStream = (v as any).captureStream ? (v as any).captureStream() : ((v as any).mozCaptureStream ? (v as any).mozCaptureStream() : null);
          if (vStream) {
            const originalTracks = vStream.getAudioTracks();
            if (originalTracks && originalTracks.length > 0) {
              stream.addTrack(originalTracks[0].clone());
            }
          }
        }
      } catch (err) {
        console.warn("Failed to capture original stream audio:", err);
      }
    } else {
      try {
        recAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioDest = recAudioCtx.createMediaStreamDestination();

        if (soundtrackChoice.startsWith('preset-')) {
          const preset = presetMusic[soundtrackChoice];
          if (preset) {
            recPlayer = new ChiptunePlayer(preset.melody, preset.bass, preset.tempo);
            recPlayer.start(recAudioCtx, audioDest);
          }
        } else if (soundtrackChoice === 'custom' && customAudioUrl) {
          recAudioElement = new Audio(customAudioUrl);
          recAudioElement.crossOrigin = "anonymous";
          recAudioElement.loop = true;
          recAudioElement.currentTime = 0;
          
          const source = recAudioCtx.createMediaElementSource(recAudioElement);
          source.connect(audioDest);
          recAudioElement.play().catch(() => {});
        }

        const recAudioTracks = audioDest.stream.getAudioTracks();
        if (recAudioTracks.length > 0) {
          stream.addTrack(recAudioTracks[0]);
        }
      } catch (audioErr) {
        console.error("Failed to build sound track for export recording:", audioErr);
      }
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = async () => {
      setIsRecording(false);
      setRecordProgress(0);

      // Clean up export audio components
      if (recPlayer) {
        recPlayer.stop();
      }
      if (recAudioElement) {
        recAudioElement.pause();
        recAudioElement.src = '';
      }
      if (recAudioCtx) {
        recAudioCtx.close().catch(() => {});
      }

      const videoBlob = new Blob(chunks, { type: mimeType || 'video/mp4' });
      const videoBlobUrl = URL.createObjectURL(videoBlob);
      const timestamp = Date.now();

      if (exportFormat === 'video') {
        const link = document.createElement('a');
        link.download = `GBC_LIVE_${timestamp}.mp4`;
        link.href = videoBlobUrl;
        link.click();
      } else {
        const processedStill = processImage(video, params, selectedPalette);
        const stillCanvas = renderFinalOutput(processedStill, params, selectedPalette, exportWithConsoleBezel);

        stillCanvas.toBlob(async (stillBlob) => {
          if (!stillBlob) return;

          try {
            const zip = new JSZip();
            const pName = `GBC_LIVE_${timestamp}`;

            zip.file(`${pName}.JPG`, stillBlob);
            zip.file(`${pName}.MP4`, videoBlob);

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipDlUrl = URL.createObjectURL(zipBlob);

            const link = document.createElement('a');
            link.download = `GBC_Live_Photo_${timestamp}.zip`;
            link.href = zipDlUrl;
            link.click();
          } catch (zipErr) {
            console.error("ZIP package sync failed, falling back to basic stream:", zipErr);
            const vLink = document.createElement('a');
            vLink.download = `GBC_LIVE_${timestamp}.mp4`;
            vLink.href = videoBlobUrl;
            vLink.click();
          }
        }, 'image/jpeg', 0.95);
      }

      if (!isPausedBefore) {
        video.play().catch(() => {});
      }
    };

    recorder.start();
    video.play().catch(() => {});

    const duration = video.duration || 3;
    const processLoop = () => {
      if (video.ended || video.currentTime >= duration) {
        recorder.stop();
        video.pause();
      } else {
        paintFrame();
        setRecordProgress(Math.min(100, Math.round((video.currentTime / duration) * 100)));
        requestAnimationFrame(processLoop);
      }
    };

    processLoop();
  };

  const handleFile = (file: File) => {
    const isVideoFile = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov') || file.name.toLowerCase().endsWith('.mp4');
    
    if (isVideoFile) {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setMediaType('video');
      setVideoPlaying(true);
      setVideoMuted(true);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageUrl(event.target.result as string);
          setMediaType('image');
          if (videoUrl) {
            URL.revokeObjectURL(videoUrl);
            setVideoUrl(null);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (customAudioUrl) {
        URL.revokeObjectURL(customAudioUrl);
      }
      const url = URL.createObjectURL(file);
      setCustomAudioUrl(url);
      setCustomAudioName(file.name);
      setSoundtrackChoice('custom');
    }
  };

  const resetCustomAudio = () => {
    if (customAudioUrl) {
      URL.revokeObjectURL(customAudioUrl);
    }
    setCustomAudioUrl(null);
    setCustomAudioName(null);
    setSoundtrackChoice('original');
  };

  // Drag and drop image upload handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Dowload resulting artwork helper
  const downloadResult = () => {
    if (mediaType === 'video') {
      startRecordingLivePhoto();
      return;
    }

    let targetImg = imageRef.current;
    if (!targetImg) {
      if (!processedCanvasRef.current) return;
      // Fallback: download the preview canvas directly
      const link = document.createElement('a');
      link.download = `gb-pixel-art-${Date.now()}.png`;
      link.href = processedCanvasRef.current.toDataURL('image/png');
      link.click();
      return;
    }
    
    // Process pixelation offscreen
    const processed = processImage(targetImg, params, selectedPalette);
    
    // Render the final output canvas with the chosen bezel option!
    const downloadCanvas = renderFinalOutput(processed, params, selectedPalette, exportWithConsoleBezel);
    
    const link = document.createElement('a');
    link.download = `gb-pixel-art-${exportWithConsoleBezel ? 'with-bezel-' : 'pure-'}${Date.now()}.png`;
    link.href = downloadCanvas.toDataURL('image/png');
    link.click();
  };

  const updateParam = <K extends keyof ConverterParams>(key: K, value: ConverterParams[K]) => {
    setParams(prev => {
      const next = { ...prev, [key]: value };
      return next;
    });
    if (key === 'showConsoleLink') {
      setExportWithConsoleBezel(!!value);
    }
  };

  const selectPalette = (palette: ColorPalette) => {
    setSelectedPalette(palette);
    updateParam('paletteId', palette.id);
  };

  const handleCustomColorChange = (index: number, hex: string) => {
    const updatedCustom = [...params.customColors];
    updatedCustom[index] = hex;
    updateParam('customColors', updatedCustom);
    
    if (selectedPalette.id === 'custom') {
      setSelectedPalette(current => ({
        ...current,
        colors: updatedCustom
      }));
    } else {
      const customPal: ColorPalette = {
        id: 'custom',
        name: '自定义调色板 🛠️',
        colors: updatedCustom,
        isCustom: true
      };
      setSelectedPalette(customPal);
      updateParam('paletteId', 'custom');
    }
  };

  const resetParams = () => {
    setParams(INITIAL_PARAMS);
    setSelectedPalette(PRESET_PALETTES[0]);
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-gray-200 font-mono select-none relative overflow-x-hidden" id="gb-root">
      {/* Immersive CRT overlay and retro phosphor glow effects */}
      <div className="pointer-events-none fixed inset-0 z-40 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.015),rgba(0,0,0,0.065)_50%,rgba(0,0,0,0.12)_50%,transparent)] bg-[size:100%_5px] opacity-75" />
      <div className="pointer-events-none fixed inset-0 z-40 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,rgba(0,0,0,0.35)_100%)] mix-blend-overlay" />
      <div className="pointer-events-none fixed inset-0 z-30 bg-[#a32252]/5 opacity-[0.03]" />

      {/* Primary Header Hero Area styled as an authentic console motherboard branding board */}
      <header className="border-b-4 border-black bg-gradient-to-r from-[#d43d6a] via-[#ac244e] to-[#8d1b3e] sticky top-0 z-30 px-6 py-4 shadow-[0_5px_15px_-3px_rgba(0,0,0,0.8)]" id="gb-header">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Retro LED power light & console icon */}
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-[#efff00] to-[#ffa502] opacity-50 blur-sm animate-pulse" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-[#222] border-2 border-black text-[#d43d6a] shadow-[3px_3px_0_#000]">
                <Gamepad2 className="h-6 w-6 text-pink-500 animate-bounce" />
              </div>
              {/* Core physical LED indicator light red */}
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-600 shadow-[0_0_8px_#ef4444]"></span>
              </span>
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-bold tracking-tighter text-white flex items-center gap-2">
                  GAME BOY <span className="text-yellow-300 font-extrabold tracking-widest bg-black/40 px-2 py-0.5 rounded border border-yellow-300/30 text-xs">COLOR</span>
                </h1>
                <span className="text-[10px] text-pink-200 uppercase bg-[#8d1b3e] px-2 py-0.5 rounded-full border border-[#d43d6a] font-bold">1998 Simulator</span>
              </div>
              <p className="text-xs text-pink-100/80 mt-0.5 tracking-tight">一键怀旧图像像素转换器 ‧ 独家 Atomic Berry 外壳臻品</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-1.5 border-2 border-black bg-[#222] text-white hover:bg-neutral-800 px-3 py-2 text-xs font-bold uppercase tracking-tight shadow-[3px_3px_0_#000] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all cursor-pointer"
              id="btn-guide-toggle"
            >
              <HelpCircle className="h-4 w-4 text-emerald-400" />
              说明手册
            </button>
            <button
              onClick={resetParams}
              className="flex items-center gap-1.5 border-2 border-black bg-[#c41d4a] text-white hover:bg-red-700 px-3 py-2 text-xs font-bold uppercase tracking-tight shadow-[3px_3px_0_#000] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all cursor-pointer"
              id="btn-reset"
            >
              <RotateCcw className="h-4 w-4 text-white" />
              重置参数
            </button>
          </div>
        </div>
      </header>

      {/* Instruction Guide modal styling with absolute retro aesthetics */}
      <AnimatePresence>
        {showGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => setShowGuide(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              className="w-full max-w-lg bg-[#181a1f] border-4 border-black p-6 rounded-3xl shadow-[8px_8px_0_#000] relative"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-3 right-3">
                <button 
                  onClick={() => setShowGuide(false)}
                  className="font-black border-2 border-black px-2 py-0.5 rounded bg-rose-600 text-white text-xs hover:bg-rose-700"
                >
                  X
                </button>
              </div>

              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 border-b-2 border-dashed border-neutral-700 pb-2">
                <Sparkles className="h-5 w-5 text-yellow-400 animate-spin" /> 
                GBC RETRO 极客模拟器规则
              </h3>
              <div className="space-y-4 text-xs text-gray-300">
                <p className="leading-relaxed">
                  本转换器深度模拟 1998 年发售的 <strong>Game Boy Color (GBC)</strong> 硬件架构。
                  可在网页端高度还原彩色液晶玻璃的像素对齐与网点灰度渲染。
                </p>
                <div className="bg-[#121215] p-3 border-2 border-black rounded-lg space-y-2 font-mono">
                  <div className="flex justify-between text-yellow-300">
                    <span>1. 物理分辨率比例</span>
                    <span>160 × 144 标准画幅</span>
                  </div>
                  <div className="flex justify-between text-teal-400">
                    <span>2. Floyd-Steinberg 抖动</span>
                    <span>完美还原 15-bit 色彩深度噪阶</span>
                  </div>
                  <div className="flex justify-between text-pink-400">
                    <span>3. 玻璃像素栅格</span>
                    <span>增加透光细缝，拟真物理屏幕质感</span>
                  </div>
                </div>
                <p className="text-gray-400 p-2.5 bg-black/30 rounded border border-neutral-800">
                  💡 <strong className="text-yellow-400">极客秘笈</strong>：切换“<strong>掌机外设</strong>”面板以调节真实硬件外壳。开启后，我们精心渲染出精致物理十字胶键、炫色 A/B 双钮、红光电源探灯和侧下排气孔，让转换出的作品充满沉浸式实物摄影收藏质感！
                </p>
              </div>
              <button 
                onClick={() => setShowGuide(false)}
                className="mt-6 w-full py-3 bg-[#9bbc0f] text-[#0f380f] font-bold uppercase text-xs border-2 border-black shadow-[3px_3px_0_#000] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all cursor-pointer hover:bg-[#8bac0f]"
              >
                点此塞入卡带 ‧ 开始创作！
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 py-8" id="gb-main">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT PANEL: High Fidelity Live Preview Canvas Screen Area */}
          <div className="lg:col-span-7 flex flex-col items-center w-full">
            
            {params.showConsoleLink ? (() => {
              const bTheme = getHtmlBezelTheme();
              return (
                /* Visual Physical Console Bezel Shell Frame (Dynamic Themed Design) */
                <div className={`w-full max-w-[530px] rounded-[52px] p-6 pb-14 relative flex flex-col items-center gap-4 transition-all duration-300 ${bTheme.wrapper}`} id="gbh-console-frame">
                  
                  {/* Dynamic Speckle texture grain layer on physical plastic */}
                  {params.consoleTextureAlpha > 0 && (
                    <div 
                      className="absolute inset-0 pointer-events-none rounded-[52px] bg-repeat"
                      style={{ 
                        backgroundImage: `radial-gradient(rgba(0,0,0,0.15) 15%, transparent 16%)`, 
                        backgroundSize: '3px 3px',
                        opacity: (params.consoleTextureAlpha / 100) * 0.4
                      }} 
                    />
                  )}

                  {/* Top aesthetic accent lines on retro handheld bezel */}
                  <div className={`w-40 h-2 rounded-full opacity-45 shadow-inner mb-1 ${bTheme.topLine}`} />

                  {/* Screen Bezel glass background wrapper with classic color power LED label */}
                  <div className="w-full bg-[#1c1c1e] rounded-2xl border-[12px] border-[#131314] shadow-2xl p-5 relative overflow-hidden flex flex-col">
                    
                    {/* Physical Power/Battery indicator on GBC left side bezel */}
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
                      <span className="text-[6px] tracking-tighter text-[#888] font-bold uppercase font-mono">Power</span>
                      <div className={`h-2.5 w-2.5 rounded-full border border-black/50 transition-all duration-300 ${getHtmlPowerLedStyle()}`} />
                    </div>

                    {/* Top aesthetic double grey screen line */}
                    <span className="w-full h-1 bg-gradient-to-r from-teal-500 via-pink-500 to-yellow-400 opacity-60 mb-2 rounded" />

                    {/* Display processing loader indicator */}
                    {isProcessing && (
                      <div className="absolute top-8 left-12 z-20 flex items-center gap-1 bg-black/95 px-3 py-1.5 rounded border-2 border-pink-500 text-[10px] text-pink-400 font-bold animate-pulse uppercase tracking-wider">
                        <RefreshCw className="h-3 w-3 animate-spin text-pink-500" />
                        ROM READ ‧ 像素载入中
                      </div>
                    )}

                    {/* Responsive Container for our output canvas nestled deep under the GBC screen crystal */}
                    <div 
                      ref={outputCanvasContainerRef} 
                      className="w-full h-auto bg-[#8b913d] flex items-center justify-center min-h-[260px] max-h-[380px] rounded-lg overflow-hidden border-2 border-black/80 shadow-inner relative transition-colors duration-300"
                      id="gb-canvas-wrapper"
                      style={{ backgroundImage: 'radial-gradient(#9ca04c 45%, #939744 55%)' }}
                    />

                    {/* Under-screen crystal brand lettering: "GAME BOY COLOR" but stylized */}
                    <div className="mt-3.5 flex justify-center items-center gap-2">
                      <span className="text-gray-300 select-none tracking-widest text-[11px] font-black uppercase font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] flex gap-1.5 justify-center items-center h-5">
                        <span>{((params.consoleLogoText || 'GAME BOY COLOR').trim().split(/\s+/).slice(0, -1).join(' ')) || (params.consoleLogoText ? '' : 'GAME BOY')}</span>
                        <span className="italic bg-gradient-to-r from-teal-400 via-yellow-400 to-pink-500 bg-clip-text text-transparent">
                          {(params.consoleLogoText || 'GAME BOY COLOR').trim().split(/\s+/).pop()}
                        </span>
                      </span>
                    </div>

                  </div>

                  {/* Physical Interactive Elements (D-Pad, buttons, speaker lines to perfect physical nostalgia) */}
                  <div className="w-full px-5 mt-4 flex justify-between items-start relative select-none z-10">
                    
                    {/* 1. Hardware Cross D-Pad Button */}
                    <div className="relative w-24 h-24 flex items-center justify-center scale-[1.3] origin-center">
                      {/* Outer circle recess shadow */}
                      <div className="absolute inset-0.5 rounded-full bg-black/25 shadow-inner" />
                      {/* Cross key structure */}
                      <div className="relative w-20 h-20">
                        {/* Horizontal Bar */}
                        <div className="absolute top-7 left-0 w-20 h-6 bg-[#1f1f23] rounded-sm border-y border-black/40 shadow-md">
                          <div className="w-1.5 h-full bg-[#141416] absolute left-1" />
                          <div className="w-1.5 h-full bg-[#141416] absolute right-1" />
                        </div>
                        {/* Vertical Bar */}
                        <div className="absolute top-0 left-7 w-6 h-20 bg-[#1f1f23] rounded-sm border-x border-black/40 shadow-inner">
                          <div className="h-1.5 w-full bg-[#141416] absolute top-1" />
                          <div className="h-1.5 w-full bg-[#141416] absolute bottom-1" />
                        </div>
                        {/* Center indentation circle */}
                        <div className="absolute top-7 left-7 w-6 h-6 bg-[#1f1f23] rounded-full shadow-inner flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-black/40" />
                        </div>
                      </div>
                    </div>

                    {/* 2. Plastic Action Dual Keys (A / B) */}
                    <div className={`flex gap-4 items-center p-2.5 rounded-[28px] rotate-[-12deg] mt-3 transition-colors duration-300 scale-[1.3] origin-center ${bTheme.buttonBox}`}>
                      <div className="flex flex-col items-center">
                        <button 
                          onClick={() => {
                            // Secret interactive effect: randomize palette
                            const rand = PRESET_PALETTES[Math.floor(Math.random() * PRESET_PALETTES.length)];
                            selectPalette(rand);
                          }}
                          className="w-11 h-11 rounded-full bg-[#a3153d] active:bg-rose-950 active:scale-95 border-2 border-black/80 shadow-[0_3px_5px_rgba(0,0,0,0.4)] flex items-center justify-center text-[11px] font-black font-mono text-white text-shadow-md cursor-pointer select-none"
                        >
                          B
                        </button>
                        <span className={`text-[7px] mt-1 font-bold uppercase font-mono tracking-tighter ${bTheme.powerLabel}`}>Undo</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <button 
                          onClick={downloadResult}
                          className="w-11 h-11 rounded-full bg-[#a3153d] active:bg-rose-950 active:scale-95 border-2 border-black/80 shadow-[0_3px_5px_rgba(0,0,0,0.4)] flex items-center justify-center text-[11px] font-black font-mono text-white text-shadow-md cursor-pointer select-none"
                        >
                          A
                        </button>
                        <span className={`text-[7px] mt-1 font-bold uppercase font-mono tracking-tighter ${bTheme.powerLabel}`}>Save</span>
                      </div>
                    </div>

                  </div>

                  {/* Start & Select Rubber Button Bar */}
                  <div className="flex gap-6 mt-2 relative select-none z-10 scale-[1.3] origin-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-12 h-3.5 bg-[#1f1f23] rounded-full rotate-[-26deg] border border-black/40 shadow-inner flex items-center justify-center cursor-pointer hover:brightness-110 active:brightness-90 transition" onClick={() => fileInputRef.current?.click()}>
                        <div className="w-10 h-2 bg-neutral-600 rounded-full" />
                      </div>
                      <span className={`text-[8px] uppercase font-mono font-bold tracking-tight ${bTheme.powerLabel}`}>Select</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 flex-wrap">
                      <div className="w-12 h-3.5 bg-[#1f1f23] rounded-full rotate-[-26deg] border border-black/40 shadow-inner flex items-center justify-center cursor-pointer hover:brightness-110 active:brightness-90 transition" onClick={() => setShowGuide(true)}>
                        <div className="w-10 h-2 bg-neutral-600 rounded-full" />
                      </div>
                      <span className={`text-[8px] uppercase font-mono font-bold tracking-tight ${bTheme.powerLabel}`}>Start</span>
                    </div>
                  </div>

                  {/* Genuine GBC dynamic bottom grid speaker lines cuts */}
                  <div className="absolute bottom-4 right-14 flex gap-2 rotate-[-28deg] select-none opacity-50 z-10">
                    <div className="w-1.5 h-10 bg-black/40 rounded-full" />
                    <div className="w-1.5 h-10 bg-black/40 rounded-full" />
                    <div className="w-1.5 h-10 bg-black/40 rounded-full" />
                    <div className="w-1.5 h-10 bg-black/40 rounded-full" />
                  </div>

                </div>
              );
            })() : (
              /* Minimalist Ultra-Crisp Viewport Container - Directly present the beautiful pixel output */
              <div className="w-full max-w-[530px] bg-[#181a1f] border-2 border-black rounded-3xl p-5 shadow-[6px_6px_0_#000] relative flex flex-col gap-4" id="gbh-pure-frame">
                
                {/* Dynamic Screen Header Indicator Card */}
                <div className="flex items-center justify-between border-b border-neutral-805 border-dashed border-neutral-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9bbc0f] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9bbc0f]"></span>
                    </span>
                    <span className="text-[10px] font-black tracking-widest text-pink-500 uppercase flex items-center gap-1">
                      Interactive LCD Canvas ‧ 实时流
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-gray-400 font-extrabold uppercase">
                    Direct Pixel Out
                  </span>
                </div>

                {/* Direct display frame for canvas output */}
                <div className="w-full relative overflow-hidden bg-black/35 rounded-2xl border-2 border-dashed border-neutral-800 p-2">
                  {isProcessing && (
                    <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-black border-2 border-pink-500 px-3 py-1 text-[9px] font-bold text-pink-400 rounded uppercase tracking-wider animate-pulse">
                      <RefreshCw className="h-3 w-3 animate-spin text-pink-500" />
                      FLUSHING FRAME BUFFER...
                    </div>
                  )}

                  {/* Core Mounted Canvas Output Block */}
                  <div 
                    ref={outputCanvasContainerRef} 
                    className="w-full h-auto bg-[#1a1c22] flex items-center justify-center min-h-[300px] max-h-[420px] rounded-xl overflow-hidden relative shadow-inner border border-black"
                    id="gb-canvas-wrapper"
                  />
                </div>

                <div className="text-[10px] text-center text-gray-500 font-bold uppercase tracking-tight py-0.5 bg-black/25 rounded border border-neutral-800/40">
                  💡 你可以随时在 <strong>【2_实体掌机模拟外壳】</strong> 属性卡片中开启、拔插或自定义掌机外观！
                </div>

              </div>
            )}

            {/* Real-time Dynamic Video / Live Photo media player controller */}
            {mediaType === 'video' && (
              <div className="w-full max-w-[530px] mt-4 bg-[#111215] p-4 rounded-2xl border-2 border-black shadow-[4px_4px_0_#000] flex flex-col gap-3 font-mono">
                {/* Header banner */}
                <div className="flex items-center justify-between text-[10px] pb-2 border-b border-neutral-850">
                  <span className="flex items-center gap-1.5 text-teal-400 font-bold uppercase">
                    <Film className="h-3.5 w-3.5 animate-pulse text-teal-400" />
                    LIVE PHOTO ACTIVE 🍏 | 实况模式
                  </span>
                  <span className="text-gray-500 font-extrabold uppercase">
                    LOOP PLAYBACK
                  </span>
                </div>

                {/* Scrubber timeline track bar */}
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span className="w-10 text-right font-mono">
                    {formatTime(videoCurrentTime)}
                  </span>
                  <div className="flex-1 bg-neutral-900 rounded-full h-2.5 relative border border-neutral-805 overflow-hidden cursor-pointer" onClick={handleTimelineClick}>
                    <div 
                      className="bg-teal-500 h-full rounded-full transition-all duration-75"
                      style={{ width: `${videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-10 text-left font-mono">
                    {formatTime(videoDuration)}
                  </span>
                </div>

                {/* Operating play buttons */}
                <div className="flex flex-col gap-3 pt-1">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVideoPlaying(!videoPlaying)}
                        className={`p-2 rounded-lg border-2 border-black shadow-[2px_2px_0_#000] text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 px-3 active:translate-y-0.5 active:shadow-none ${
                          videoPlaying 
                            ? 'bg-neutral-800/80 hover:bg-neutral-700 hover:text-white border-neutral-700 text-gray-300' 
                            : 'bg-teal-500 text-black hover:bg-teal-400 border-teal-600'
                        }`}
                      >
                        {videoPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        <span>{videoPlaying ? 'PAUSE' : 'PLAY'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVideoMuted(!videoMuted)}
                        className={`p-2 rounded-lg border-2 border-black shadow-[2px_2px_0_#000] text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 px-3 active:translate-y-0.5 active:shadow-none ${
                          !videoMuted 
                            ? 'bg-yellow-400 text-[#0f380f]' 
                            : 'bg-neutral-800/85 text-gray-400 hover:text-white border-neutral-700'
                        }`}
                      >
                        {videoMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                        <span>{videoMuted ? 'MUTED' : 'VOLUME'}</span>
                      </button>
                    </div>

                    {/* Dual toggle switcher layout */}
                    <div className="flex bg-black/55 border-2 border-neutral-850 rounded-lg p-0.5 text-[9px] font-black">
                      <button
                        type="button"
                        onClick={() => setExportFormat('video')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${
                          exportFormat === 'video'
                            ? 'bg-teal-500 text-black font-extrabold shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        🎬 朋友圈直发
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFormat('zip')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${
                          exportFormat === 'zip'
                            ? 'bg-pink-500 text-white font-extrabold shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        📁 锁屏实况包
                      </button>
                    </div>
                  </div>

                  {/* Frame Rate Selection Layout */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-t border-b border-neutral-850/60">
                    <span className="text-[10px] text-gray-400 font-extrabold uppercase flex items-center gap-1.5">
                      <Sliders className="h-3.5 w-3.5 text-amber-500" />
                      导出画面帧率:
                    </span>
                    <div className="flex flex-wrap bg-black/55 border-2 border-neutral-850 rounded-lg p-0.5 text-[9px] font-black gap-0.5">
                      <button
                        type="button"
                        onClick={() => setExportFpsChoice('original')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${
                          exportFpsChoice === 'original'
                            ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                            : 'text-gray-400 hover:text-white font-medium'
                        }`}
                      >
                        ⚡ 原画细腻 (30)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFpsChoice('gbc')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${
                          exportFpsChoice === 'gbc'
                            ? 'bg-purple-500 text-white font-extrabold shadow-sm'
                            : 'text-gray-400 hover:text-white font-medium'
                        }`}
                      >
                        👾 复古 (15)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFpsChoice('10fps')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${
                          exportFpsChoice === '10fps'
                            ? 'bg-rose-500 text-white font-extrabold shadow-sm'
                            : 'text-gray-400 hover:text-white font-medium'
                        }`}
                      >
                        🎞️ 定格 (10)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFpsChoice('5fps')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${
                          exportFpsChoice === '5fps'
                            ? 'bg-indigo-500 text-white font-extrabold shadow-sm'
                            : 'text-gray-400 hover:text-white font-medium'
                        }`}
                      >
                        🐢 极简 (5)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFpsChoice('3fps')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${
                          exportFpsChoice === '3fps'
                            ? 'bg-teal-500 text-black font-extrabold shadow-sm'
                            : 'text-gray-400 hover:text-white font-medium'
                        }`}
                      >
                        🎨 极其复古 (3)
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={downloadResult}
                    disabled={isRecording}
                    className={`w-full p-2.5 rounded-lg font-black text-xs border-2 border-black shadow-[3px_3px_0_#000] active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 transition-all ${
                      exportFormat === 'video'
                        ? 'bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-black'
                        : 'bg-gradient-to-r from-pink-500 to-rose-600 hover:brightness-110 text-white'
                    }`}
                  >
                    {isRecording ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isRecording 
                      ? `正在打包灌录像素作品中... (${recordProgress}%)` 
                      : exportFormat === 'video'
                        ? '🟢 导出微信朋友圈直发免解压视频 (MP4)'
                        : '🍎 导出锁屏实况原包壁纸组合 (ZIP)'
                    }
                  </button>

                  <div className="text-[8.5px] text-gray-500 text-center leading-relaxed font-sans px-1 pt-0.5 flex flex-col gap-1">
                    <div>
                      {exportFormat === 'video'
                        ? '💡 提示：高兼容 MP4 精装视频，保存至手机相册后在朋友圈直发支持高达 30 秒自动循环游玩播放！'
                        : '💡 提示：ZIP 压缩包内配对专属 JPG 图片 与 MP4，可配合系统工具/壁纸转换软件。'
                      }
                    </div>
                    <div className="text-amber-500/80 font-bold text-left">
                      {exportFpsChoice === 'original' && '⚡ 当前选项：保持原视频 30 FPS 的细腻高帧，动作顺滑丝滑流转。'}
                      {exportFpsChoice === 'gbc' && '👾 当前选项：锁定 retro 15 FPS 体验，还原 Game Boy 掌机标志性的阻尼定格与电子怀旧质感。'}
                      {exportFpsChoice === '10fps' && '🎞️ 当前选项：10 FPS 经典定格动画品质，具有强烈的手工黏土及逐格分镜即视感。'}
                      {exportFpsChoice === '5fps' && '🐢 当前选项：5 FPS 慢速幻灯片风格，极低帧率像素颗粒流动，复古味十足。'}
                      {exportFpsChoice === '3fps' && '🎨 当前选项：3 FPS 极端幻灯片慢速画风，画面逐帧极其复古，极富电子艺术定格质感！'}
                    </div>
                  </div>
                </div>

                {/* 实况照片画面尺寸与缩放微调组 (Resize & Offset controls for Live Photos) */}
                <div className="pt-3 border-t-2 border-dashed border-neutral-800 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] text-teal-400 font-extrabold uppercase">
                      <Sliders className="h-3.5 w-3.5 text-teal-400" />
                      实况画面尺寸与缩放微调 (Live Frame Resize & Shifting)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        updateParam('photoScale', 100);
                        updateParam('photoOffsetX', 0);
                        updateParam('photoOffsetY', 0);
                        updateParam('photoFitMode', 'cover');
                      }}
                      className="text-[9px] font-black text-gray-400 hover:text-white flex items-center gap-1 uppercase transition bg-black/40 border-2 border-neutral-800 py-0.5 px-2 rounded-md hover:border-neutral-700 cursor-pointer"
                    >
                      <RotateCcw className="h-2.5 w-2.5" />
                      重置尺寸
                    </button>
                  </div>

                  {/* 自适应模式 */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'cover', label: '智能填充 (Cover)' },
                      { id: 'contain', label: '完整置中 (Contain)' },
                      { id: 'fill', label: '拉伸铺满 (Fill)' }
                    ].map((fit) => (
                      <button
                        key={fit.id}
                        type="button"
                        onClick={() => updateParam('photoFitMode', fit.id as any)}
                        className={`py-1 rounded-lg text-[9px] font-black border-2 transition-all cursor-pointer ${
                          params.photoFitMode === fit.id 
                            ? 'border-teal-500 bg-teal-500/10 text-white shadow-[1.5px_1.5px_0_#14b8a6]' 
                            : 'border-neutral-800 bg-black/20 text-gray-400 hover:text-white'
                        }`}
                      >
                        {fit.label}
                      </button>
                    ))}
                  </div>

                  {/* 缩放滑块 */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold">
                        <span className="uppercase tracking-wide">🔍 缩放大小 (ZOOM)</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-yellow-300 font-bold bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-850 text-[9px]">{params.photoScale ?? 100}%</span>
                          <div className="flex bg-black/40 border border-neutral-800 rounded overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateParam('photoScale', Math.max(10, (params.photoScale ?? 100) - 10))}
                              className="px-1.5 py-0.5 text-[9px] font-black border-r border-[#222] hover:bg-neutral-800/60 active:bg-neutral-700 text-gray-300 cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => updateParam('photoScale', Math.max(10, (params.photoScale ?? 100) - 25))}
                              className="px-1.5 py-0.5 text-[9px] font-bold border-r border-[#222] hover:bg-neutral-800/60 active:bg-neutral-700 text-gray-400 cursor-pointer"
                            >
                              -25%
                            </button>
                            <button
                              type="button"
                              onClick={() => updateParam('photoScale', Math.min(300, (params.photoScale ?? 100) + 25))}
                              className="px-1.5 py-0.5 text-[9px] font-bold border-r border-[#222] hover:bg-neutral-800/60 active:bg-neutral-700 text-gray-400 cursor-pointer"
                            >
                              +25%
                            </button>
                            <button
                              type="button"
                              onClick={() => updateParam('photoScale', Math.min(300, (params.photoScale ?? 100) + 10))}
                              className="px-1.5 py-0.5 text-[9px] font-black hover:bg-neutral-800/60 active:bg-neutral-700 text-gray-300 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                      <input 
                        type="range" 
                        min="10" 
                        max="300" 
                        value={params.photoScale !== undefined ? params.photoScale : 100} 
                        onChange={(e) => updateParam('photoScale', parseInt(e.target.value))}
                        className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                      />
                    </div>

                    {/* 水平与垂直位移滑块 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                          <span className="uppercase tracking-wide">↔️ 水平移动 (SHIFT X)</span>
                          <span className="font-mono text-yellow-300 bg-neutral-900 px-1 py-0.5 rounded text-[9px] font-bold">{params.photoOffsetX ?? 0}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="-100" 
                          max="100" 
                          value={params.photoOffsetX !== undefined ? params.photoOffsetX : 0} 
                          onChange={(e) => updateParam('photoOffsetX', parseInt(e.target.value))}
                          className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                          <span className="uppercase tracking-wide">↕️ 垂直移动 (SHIFT Y)</span>
                          <span className="font-mono text-yellow-300 bg-neutral-900 px-1 py-0.5 rounded text-[9px] font-bold">{params.photoOffsetY ?? 0}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="-100" 
                          max="100" 
                          value={params.photoOffsetY !== undefined ? params.photoOffsetY : 0} 
                          onChange={(e) => updateParam('photoOffsetY', parseInt(e.target.value))}
                          className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 音乐声轨更换与自定义 GBC 芯片乐 (Live Audio Soundtrack replacement engine) */}
                <div className="pt-3 border-t-2 border-dashed border-neutral-800 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] text-teal-400 font-extrabold uppercase">
                      <Music className="h-3.5 w-3.5 text-teal-400 animate-pulse" />
                      声轨包装 & 模仿 GBC 8位音效 (Soundtrack Replace Engine)
                    </span>
                  </div>

                  {/* Audio Mode buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSoundtrackChoice('original')}
                      className={`py-1.5 px-2 rounded-lg text-[9px] font-black border-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        soundtrackChoice === 'original'
                          ? 'border-teal-500 bg-teal-500/10 text-white shadow-[1.5px_1.5px_0_#14b8a6]'
                          : 'border-neutral-800 bg-black/20 text-gray-400 hover:text-white'
                      }`}
                    >
                      🗣️ 视频原声轨
                    </button>

                    <button
                      type="button"
                      onClick={() => soundtrackChoice === 'custom' ? null : fileInputAudioRef.current?.click()}
                      className={`relative py-1.5 px-2 rounded-lg text-[9px] font-black border-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        soundtrackChoice === 'custom'
                          ? 'border-pink-500 bg-pink-500/10 text-white shadow-[1.5px_1.5px_0_#ec4899]'
                          : 'border-neutral-800 bg-black/20 text-gray-400 hover:text-white'
                      }`}
                    >
                      📤 自定义上传
                      <input
                        type="file"
                        ref={fileInputAudioRef}
                        accept="audio/*"
                        onChange={handleAudioUpload}
                        className="hidden"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => setSoundtrackChoice('preset-adventure')}
                      className={`py-1.5 px-2 rounded-lg text-[9px] font-black border-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        soundtrackChoice === 'preset-adventure'
                          ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-[1.5px_1.5px_0_#10b981]'
                          : 'border-neutral-800 bg-black/20 text-gray-400 hover:text-white'
                      }`}
                    >
                      👑 口袋冒险 (Preset)
                    </button>

                    <button
                      type="button"
                      onClick={() => setSoundtrackChoice('preset-puzzle')}
                      className={`py-1.5 px-2 rounded-lg text-[9px] font-black border-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        soundtrackChoice === 'preset-puzzle'
                          ? 'border-[#a855f7] bg-purple-500/10 text-white shadow-[1.5px_1.5px_0_#a855f7]'
                          : 'border-neutral-800 bg-black/20 text-gray-400 hover:text-white'
                      }`}
                    >
                      🧩 俄罗斯方块 (Preset)
                    </button>

                    <button
                      type="button"
                      onClick={() => setSoundtrackChoice('preset-cozy')}
                      className={`py-1.5 px-2 rounded-lg text-[9px] font-black border-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        soundtrackChoice === 'preset-cozy'
                          ? 'border-[#06b6d4] bg-cyan-500/10 text-white shadow-[1.5px_1.5px_0_#06b6d4]'
                          : 'border-neutral-800 bg-black/20 text-gray-400 hover:text-white'
                      }`}
                    >
                      🌸 像素小镇 (Preset)
                    </button>
                  </div>

                  {/* Detail of selected sound track */}
                  <div className="bg-black/35 border border-neutral-850 p-2 rounded-xl text-[9.5px] leading-relaxed flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">当前选用音轨:</span>
                      <span className="font-bold text-yellow-300 font-mono">
                        {soundtrackChoice === 'original' && '🗣️ Video Original Soundtrack (原声轨道)'}
                        {soundtrackChoice === 'custom' && `🎵 Custom: ${customAudioName || 'Uploaded Sound (自选音轨)'}`}
                        {soundtrackChoice === 'preset-adventure' && '👑 Pixel Adventure (GBC Chiptune Loop)'}
                        {soundtrackChoice === 'preset-puzzle' && '🧩 Tetris Blocks (GBC Chiptune Loop)'}
                        {soundtrackChoice === 'preset-cozy' && '🌸 Cozy Green Hill Towns (8-Bit Lullaby Loop)'}
                      </span>
                    </div>

                    {soundtrackChoice === 'custom' && customAudioName && (
                      <div className="flex items-center gap-2 justify-between mt-1 pt-1 border-t border-neutral-800/60">
                        <span className="text-gray-500 truncate max-w-[200px]">{customAudioName}</span>
                        <button
                          type="button"
                          onClick={resetCustomAudio}
                          className="text-[8.5px] font-bold text-red-500 hover:text-red-400 underline cursor-pointer"
                        >
                          移出当前声轨
                        </button>
                      </div>
                    )}

                    {soundtrackChoice.startsWith('preset-') && (
                      <div className="text-[8.5px] text-gray-400 italic mt-0.5 leading-snug text-neutral-500">
                        提示：选用 8-bit 芯片音乐时，我们将在生成 Live Photo 导出时**把该音乐波形同步灌录至 MP4 视频轨道中**，让传输到手机后的动态锁屏实况效果带有完美复古游戏音质！
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Immersive Under-canvas metadata deck */}
            <div className="w-full max-w-[530px] mt-6 flex flex-wrap items-center justify-between gap-3 bg-[#181a1f] p-4 rounded-2xl border-2 border-black shadow-[4px_4px_0_#000]">
              <div className="flex items-center gap-2 text-xs">
                <MonitorPlay className="h-5 w-5 text-pink-500" />
                <span className="text-gray-400">输出格栅像数:</span>
                <span className="font-mono text-[#9bbc0f] text-xs bg-black/80 px-2 py-0.5 rounded border border-neutral-800">
                  {params.resolutionWidth} × {params.resolutionHeight} px
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Save with/without Frame selector */}
                <label className="flex items-center gap-2.5 select-none cursor-pointer bg-black/45 px-3 py-1.5 rounded-xl border border-neutral-800 hover:border-neutral-700 hover:bg-black/60 transition">
                  <input
                    type="checkbox"
                    checked={exportWithConsoleBezel}
                    onChange={(e) => {
                      setExportWithConsoleBezel(e.target.checked);
                      updateParam('showConsoleLink', e.target.checked);
                    }}
                    className="accent-pink-500 cursor-pointer h-4 w-4"
                  />
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] font-black uppercase text-pink-500 leading-none">Export Bezel</span>
                    <span className="text-[9px] text-gray-500 leading-tight">连同掌机外壳相框导出</span>
                  </div>
                </label>

                <button
                  onClick={downloadResult}
                  className="flex items-center gap-2 rounded-lg bg-[#9bbc0f] px-5 py-2 text-xs font-black text-[#0f380f] uppercase border-2 border-black shadow-[3px_3px_0_#000] hover:bg-[#8bac0f] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all cursor-pointer"
                  id="btn-download-image"
                >
                  <Download className="h-4 w-4" />
                  保存 GBC 复古图象
                </button>
              </div>
            </div>

          </div>


          {/* RIGHT PANEL: Retro styled Controls Panel Deck */}
          <div className="lg:col-span-5 flex flex-col gap-6" id="gb-controls-panel">
            
            {/* Image Upload box styled like physical vintage cartridge slot entry */}
            <section className="bg-[#181a1f] border-2 border-black rounded-3xl p-5 shadow-[6px_6px_0_#000] relative">
              <div className="absolute top-0 right-7 w-20 h-1.5 bg-gradient-to-r from-teal-400 to-[#d43d6a] rounded-b-full shadow" />
              
              <h3 className="text-xs font-black text-white mb-3 flex items-center gap-2 uppercase tracking-wide border-b-2 border-dashed border-neutral-800 pb-2">
                <Upload className="h-4 w-4 text-[#d43d6a]" /> 1_插入图片源卡带 (Cartridge)
              </h3>

              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  dragActive ? 'border-[#d43d6a] bg-[#d43d6a]/10 scale-[1.01]' : 'border-neutral-800 hover:border-neutral-700 bg-black/30'
                }`}
                id="gb-dropzone"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*,video/*" 
                  className="hidden" 
                />
                
                <div className="flex flex-col items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-[#121215] flex items-center justify-center text-pink-500 border border-neutral-800 shadow">
                    <Upload className="h-5 w-5 animate-pulse" />
                  </div>
                  <p className="text-xs font-bold text-gray-200">一键导入照片/视频或直接拖拽</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Supports JPG, PNG, WEBP, MP4, MOV, Live Photo</p>
                </div>
              </div>

              {/* Sample Library Selectors */}
              <div className="mt-4 pt-3 border-t-2 border-dashed border-neutral-800">
                <span className="text-[10px] uppercase font-bold text-[#d43d6a] tracking-wider block mb-2">或者点选官方经典样本 (ROM List):</span>
                <div className="grid grid-cols-3 gap-2">
                  {SAMPLE_IMAGES.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => {
                        setImageUrl(sample.url);
                        setMediaType('image');
                      }}
                      className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition active:scale-95 text-left group cursor-pointer ${
                        imageUrl === sample.url ? 'border-yellow-400 ring-2 ring-yellow-400/30' : 'border-neutral-800 bg-black'
                      }`}
                    >
                      <img src={sample.url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition duration-300" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex items-end p-2">
                        <span className="text-[9px] font-bold text-white truncate w-full tracking-tighter font-mono">{sample.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* 🎮 Standalone Console Customizer Card: Whether shell is needed and its adjustments */}
            <section className="bg-[#181a1f] border-2 border-black rounded-3xl p-5 shadow-[6px_6px_0_#000] relative">
              <div className="absolute top-0 right-7 w-20 h-1.5 bg-gradient-to-r from-emerald-400 to-[#d43d6a] rounded-b-full shadow" />
              
              <div className="flex items-center justify-between border-b-2 border-dashed border-neutral-800 pb-3 mb-4">
                <h3 className="text-xs font-black text-white flex items-center gap-2 uppercase tracking-wide">
                  <Gamepad2 className="h-4 w-4 text-[#d43d6a]" /> 2_实体掌机模拟外壳 (Console Bezel)
                </h3>
                
                {/* Standalone switch toggle */}
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={params.showConsoleLink} 
                    onChange={(e) => updateParam('showConsoleLink', e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#d43d6a]" />
                </label>
              </div>

              <p className="text-[11px] text-gray-400 mb-4 font-mono leading-tight">
                将转换后的像素画面安插在一台能交互的 Game Boy Color 掌机外壳手办模型中，带有物理按键与个性化雕花！
              </p>

              {params.showConsoleLink ? (
                <div className="space-y-4">
                  {/* Bezel Shell Plastic Color Selector */}
                  <div>
                    <label className="text-[10px] uppercase font-black text-pink-500 block mb-2">手办外壳外观配色 (Shell Color):</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'dmg', label: '灰白 DMG', hex: '#b7b4a7' },
                        { id: 'yellow', label: '柠檬黄 GBC', hex: '#e6b012' },
                        { id: 'berry', label: '树莓红 GBC', hex: '#c41d4a' },
                        { id: 'turquoise', label: '湖绿 Original', hex: '#009fa5' },
                        { id: 'purple', label: '透明紫 Atomic', hex: '#493775' },
                        { id: 'clear', label: '磨砂透 Clear', hex: '#dedede' },
                        { id: 'orange', label: '香橙橘 GBA', hex: '#e05a10' },
                        { id: 'gold', label: '皇家金 Special', hex: '#cf9f23' },
                        { id: 'black', label: '曜石黑 Onyx', hex: '#111827' },
                        { id: 'blue', label: '深海蓝 Midnight', hex: '#1d4ed8' },
                        { id: 'green', label: '森林绿 Jungle', hex: '#059669' },
                        { id: 'mint', label: '薄荷绿 Mint', hex: '#5eead4' },
                        { id: 'rose', label: '樱花粉 Sakura', hex: '#f472b6' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => updateParam('bezelColor', item.id as any)}
                          className={`p-1.5 rounded-lg border-2 text-left transition-all cursor-pointer hover:bg-black/45 ${
                            params.bezelColor === item.id 
                              ? 'border-yellow-400 bg-black/60 shadow-[2px_2px_0_#fbbf24] text-white' 
                              : 'border-neutral-800 bg-black/20 text-gray-400 shadow-[1px_1px_0_rgba(0,0,0,0.5)]'
                          }`}
                        >
                          <div className="flex flex-col items-center text-center gap-1">
                            <span className="h-4 w-4 rounded-full border border-black/50 flex-shrink-0 shadow" style={{ backgroundColor: item.hex }} />
                            <span className="text-[9px] font-black truncate w-full leading-none font-sans">{item.label}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic Power LED selection buttons */}
                  <div>
                    <label className="text-[10px] uppercase font-black text-pink-500 block mb-2">电源指示灯款式 (Status LED Color):</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'red', label: '荧光红', bg: 'bg-red-500' },
                        { id: 'green', label: '春意绿', bg: 'bg-green-500' },
                        { id: 'blue', label: '极光蓝', bg: 'bg-blue-500' },
                        { id: 'orange', label: '落日橙', bg: 'bg-orange-500' },
                        { id: 'cyan', label: '冰晶青', bg: 'bg-cyan-400' },
                        { id: 'off', label: '熄灭 (静音)', bg: 'bg-neutral-600' }
                      ].map((led) => (
                        <button
                          key={led.id}
                          onClick={() => updateParam('powerLedColor', led.id as any)}
                          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            params.powerLedColor === led.id 
                              ? 'border-yellow-400 bg-yellow-400/10 text-white shadow-[2px_2px_0_#fbbf24]' 
                              : 'border-neutral-800 bg-black/20 text-gray-400'
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full border border-black/40 ${led.bg}`} />
                          <span>{led.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Customize Bezel Crystal Logo text branding line */}
                  <div>
                    <label className="text-[10px] uppercase font-black text-pink-500 block mb-1.5">屏幕镜面刻印标语 (Lens Brand Text):</label>
                    <input 
                      type="text"
                      maxLength={24}
                      value={params.consoleLogoText}
                      onChange={(e) => updateParam('consoleLogoText', e.target.value)}
                      placeholder="例如: GAME BOY COLOR"
                      className="w-full text-xs bg-black/40 border-2 border-black rounded-xl p-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition font-mono shadow-inner"
                    />
                    <span className="text-[8px] text-gray-500 block mt-1 tracking-tighter uppercase">提示: 末尾单词（如 COLOR）将自动着色成彩虹渐变字！</span>
                  </div>

                  {/* Shell Case Texture Noise alpha adjustment slider */}
                  <div>
                    <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase mb-1">
                      <span>机身复古磨砂斑驳感 (Shell Speckle)</span>
                      <span className="font-mono text-yellow-300">{params.consoleTextureAlpha}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={params.consoleTextureAlpha} 
                      onChange={(e) => updateParam('consoleTextureAlpha', parseInt(e.target.value))}
                      className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                    />
                  </div>

                </div>
              ) : (
                <div className="bg-black/20 rounded-xl p-3 border border-neutral-800/50 text-center py-5">
                  <span className="text-[10px] text-gray-500 font-mono block mb-1.5 uppercase">Console Frame Closed</span>
                  <p className="text-[11px] text-gray-500 leading-tight">您当前关闭了外壳渲染。开启上方开关即可把像素画完美内嵌到色彩丰富的实体 GBC 复古掌机中！</p>
                </div>
              )}
            </section>

            {/* Main Tabs switcher styled as mechanical select sliders */}
            <div className="bg-[#121215] border-2 border-black rounded-2xl p-1.5 flex flex-wrap gap-1 shadow-[4px_4px_0_#000]">
              <button
                onClick={() => setSelectedTab('preset')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  selectedTab === 'preset' ? 'bg-[#d43d6a] text-white font-extrabold border-2 border-black shadow-[2px_2px_0_#000]' : 'text-gray-400 hover:text-white hover:bg-neutral-800/50'
                }`}
              >
                <Palette className="h-3.5 w-3.5" />
                复古色盘
              </button>
              
              <button
                onClick={() => setSelectedTab('adjust')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  selectedTab === 'adjust' ? 'bg-[#d43d6a] text-white font-extrabold border-2 border-black shadow-[2px_2px_0_#000]' : 'text-gray-400 hover:text-white hover:bg-neutral-800/50'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                图像精调
              </button>

              <button
                onClick={() => setSelectedTab('retro')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  selectedTab === 'retro' ? 'bg-[#d43d6a] text-white font-extrabold border-2 border-black shadow-[2px_2px_0_#000]' : 'text-gray-400 hover:text-white hover:bg-neutral-800/50'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                屏幕滤片
              </button>

              <button
                onClick={() => setSelectedTab('text')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  selectedTab === 'text' ? 'bg-[#d43d6a] text-white font-extrabold border-2 border-black shadow-[2px_2px_0_#000]' : 'text-gray-400 hover:text-white hover:bg-neutral-800/50'
                }`}
              >
                <Type className="h-3.5 w-3.5" />
                游戏对白
              </button>
            </div>

            {/* TAB CONTENTS inside high-contrast solid card */}
            <div className="bg-[#181a1f] border-2 border-black rounded-3xl p-5 min-h-[300px] shadow-[6px_6px_0_#000]">
              
              {/* TAB 1: Palettes */}
              {selectedTab === 'preset' && (
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-pink-500 font-black block mb-3">
                      硬件配色滤镜 / Preset Colors Mode:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PRESET_PALETTES.map((pal) => (
                        <button
                          key={pal.id}
                          onClick={() => selectPalette(pal)}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer hover:bg-black/45 ${
                            params.paletteId === pal.id 
                              ? 'border-yellow-400 bg-black/60 shadow-[3px_3px_0_#fbbf24] text-white' 
                              : 'border-neutral-800 bg-black/20 text-gray-400 shadow-[2px_2px_0_rgba(0,0,0,0.4)]'
                          }`}
                        >
                          {/* Mini Preview Rounded Blocks */}
                          <div className="flex -space-x-1.5">
                            {pal.id === 'bit16_color' ? (
                              ['#fc2a62', '#2afc62', '#2a62fc', '#fcb52a'].map((color, cIdx) => (
                                <div 
                                  key={cIdx} 
                                  className="h-5.5 w-5.5 rounded-full border border-black shadow-inner flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                              ))
                            ) : pal.id === 'bit24_color' ? (
                              ['#ff0055', '#00ff66', '#0055ff', '#ffcc00'].map((color, cIdx) => (
                                <div 
                                  key={cIdx} 
                                  className="h-5.5 w-5.5 rounded-full border border-black shadow-inner flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                              ))
                            ) : pal.id === 'bit16_grayscale' ? (
                              ['#222222', '#666666', '#aaaaaa', '#dddddd'].map((color, cIdx) => (
                                <div 
                                  key={cIdx} 
                                  className="h-5.5 w-5.5 rounded-full border border-black shadow-inner flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                              ))
                            ) : pal.id === 'bit24_grayscale' ? (
                              ['#111111', '#555555', '#999999', '#eeeeee'].map((color, cIdx) => (
                                <div 
                                  key={cIdx} 
                                  className="h-5.5 w-5.5 rounded-full border border-black shadow-inner flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                              ))
                            ) : pal.id === 'original_color' ? (
                              ['#ff3b30', '#34c759', '#007aff', '#ffcc00'].map((color, cIdx) => (
                                <div 
                                  key={cIdx} 
                                  className="h-5.5 w-5.5 rounded-full border border-black shadow-inner flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                              ))
                            ) : (
                              pal.colors.slice(0, 4).map((color, cIdx) => (
                                <div 
                                  key={cIdx} 
                                  className="h-5.5 w-5.5 rounded-full border border-black shadow-inner flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                              ))
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[11px] font-black block truncate text-gray-200">{pal.name}</span>
                            <span className="text-[9px] text-gray-500 font-mono block uppercase">
                              {pal.id === 'bit16_color' 
                                ? '16-Bit Color / 65K' 
                                : pal.id === 'bit24_color'
                                  ? '24-Bit True-Color'
                                  : pal.id === 'bit16_grayscale'
                                    ? '16 Grays / 4-Bit'
                                    : pal.id === 'bit24_grayscale'
                                      ? '256 Grays / 8-Bit'
                                      : pal.id === 'original_color' 
                                        ? 'True Color / RGB' 
                                        : `${pal.colors.length} Color Bit`}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Outline / Edge Contour Enhancement Switch */}
                  <div className="pt-4 border-t-2 border-dashed border-neutral-800">
                    <button
                      onClick={() => updateParam('edgeEnhancement', !params.edgeEnhancement)}
                      className={`w-full py-3 px-4 rounded-xl border-2 font-black text-xs flex items-center justify-between transition-all cursor-pointer ${
                        params.edgeEnhancement
                          ? 'bg-yellow-400 border-black text-black shadow-[4px_4px_0_#d43d6a] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[3px_3px_0_#d43d6a]'
                          : 'bg-black/40 border-neutral-800 text-gray-400 hover:text-white hover:bg-black/60 shadow-[2px_2px_0_rgba(0,0,0,0.4)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Sparkles className={`h-4 w-4 ${params.edgeEnhancement ? 'text-[#d43d6a] animate-pulse' : 'text-gray-500'}`} />
                        <div className="text-left">
                          <span className="block font-black text-[11px] uppercase tracking-wide">
                            增强物体边缘轮廓 / Enhance Contours
                          </span>
                          <span className="block text-[9px] text-gray-500 font-mono leading-none mt-0.5">
                            启用像素勾边处理，加强物体边缘轮廓界线区分
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className={`h-5 w-10 rounded-full border border-black/40 p-0.5 transition-colors ${params.edgeEnhancement ? 'bg-green-500' : 'bg-neutral-800'}`}>
                          <div className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${params.edgeEnhancement ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Custom Palette Builder for total individual customization */}
                  <div className="pt-4 border-t-2 border-dashed border-neutral-800">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-black uppercase text-pink-500 flex items-center gap-2">
                        <Grid3X3 className="h-4 w-4 text-[#d43d6a]" /> 
                        自定义提纯调色板 (DIY Cartridge)
                      </span>
                    </div>
                    
                    <p className="text-[11px] text-gray-400 mb-3 font-mono leading-tight">手动精调屏幕的四层灰阶色彩槽，制作属于您的特种彩色像素风！</p>
                    <div className="grid grid-cols-4 gap-2 bg-black/40 p-3 rounded-xl border-2 border-black shadow-inner">
                      {params.customColors.map((color, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1.5">
                          <label 
                            className="relative h-11 w-11 rounded-lg cursor-pointer border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden hover:scale-105 active:scale-95 transition"
                            style={{ backgroundColor: color }}
                          >
                            <input 
                              type="color" 
                              value={color} 
                              onChange={(e) => handleCustomColorChange(idx, e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                            />
                            {/* Color channel ID badge */}
                            <span className="text-[9px] font-black text-black bg-white/70 px-1 rounded-sm border border-black shadow-sm select-none">
                              #{idx + 1}
                            </span>
                          </label>
                          <span className="font-mono text-[8px] text-gray-400 uppercase tracking-tighter">{color}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}


              {/* TAB 2: Image Fine adjust with premium retro sliders */}
              {selectedTab === 'adjust' && (
                <div className="space-y-4">
                  
                  {/* Resolution size Pixels mapping */}
                  <div>
                    <div className="flex justify-between text-[10px] font-black uppercase text-pink-500 mb-2">
                      <span>像素缩放度 (CPU Resol_Ratio)</span>
                      <span className="font-mono text-yellow-300">{params.resolutionWidth} x {params.resolutionHeight}</span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {[80, 120, 160, 240, 320, 480, 720, 1080].map((res) => {
                        const targetW = res;
                        const targetH = Math.round(res * (144 / 160));
                        return (
                          <button
                            key={res}
                            onClick={() => {
                              updateParam('resolutionWidth', targetW);
                              updateParam('resolutionHeight', targetH);
                            }}
                            className={`py-2 px-1 rounded-lg text-xs font-black font-mono border-2 transition-all cursor-pointer ${
                              params.resolutionWidth === targetW 
                                ? 'border-yellow-400 bg-yellow-400/10 text-white shadow-[2px_2px_0_#fbbf24]' 
                                : 'border-neutral-800 bg-black/20 text-gray-400 hover:text-white'
                            }`}
                          >
                            {res}p
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Brightness, Contrast, Saturation Sliders with custom gauge appearance */}
                  <div className="space-y-4 pt-3.5 border-t-2 border-dashed border-neutral-800">
                    
                    <div>
                      <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase mb-1">
                        <span>曝光亮度 (POTENTIOMETER)</span>
                        <span className="font-mono text-yellow-300">{params.brightness}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="-60" 
                          max="60" 
                          value={params.brightness} 
                          onChange={(e) => updateParam('brightness', parseInt(e.target.value))}
                          className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase mb-1">
                        <span>色彩对比 (Contrast Ratio)</span>
                        <span className="font-mono text-yellow-300">{params.contrast}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="-20" 
                          max="80" 
                          value={params.contrast} 
                          onChange={(e) => updateParam('contrast', parseInt(e.target.value))}
                          className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase mb-1">
                        <span>色彩饱和 (CHROMA)</span>
                        <span className="font-mono text-yellow-300">{params.saturation}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="-100" 
                          max="100" 
                          value={params.saturation} 
                          onChange={(e) => updateParam('saturation', parseInt(e.target.value))}
                          className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dither algorithm Selector */}
                  <div className="pt-3 border-t-2 border-dashed border-neutral-800">
                    <label className="text-[10px] uppercase font-black text-pink-500 block mb-2">
                      黑白网化干扰 (Analog Dithering):
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'none', dName: '无抖动' },
                        { id: 'bayer4', dName: 'Bayer 4x4' },
                        { id: 'bayer8', dName: 'Bayer 8x8' },
                        { id: 'floyd', dName: 'FS 算法' },
                        { id: 'halftone', dName: '网点滤网' }
                      ].map((dObj) => (
                        <button
                          key={dObj.id}
                          onClick={() => updateParam('ditherType', dObj.id as DitherType)}
                          className={`py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all cursor-pointer ${
                            params.ditherType === dObj.id 
                              ? 'border-yellow-400 bg-yellow-400/10 text-white shadow-[2px_2px_0_#fbbf24]' 
                              : 'border-neutral-800 bg-black/20 text-gray-400'
                          }`}
                        >
                          {dObj.dName}
                        </button>
                      ))}
                    </div>

                    {params.ditherType !== 'none' && (
                      <div className="mt-4">
                        <div className="flex justify-between text-[10px] uppercase text-gray-400 mb-1">
                          <span>抖动干扰强度 (NOISE FEED)</span>
                          <span className="font-mono text-yellow-300">{params.ditherAmount}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={params.ditherAmount} 
                          onChange={(e) => updateParam('ditherAmount', parseInt(e.target.value))}
                          className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                        />
                      </div>
                    )}
                  </div>

                  {/* 自定义图片缩放与位移 */}
                  <div className="pt-3 border-t-2 border-dashed border-neutral-800">
                    <label className="text-[10px] uppercase font-black text-pink-500 block mb-2">
                      上传照片画幅缩放与位移 (Photo Zoom & Shifting):
                    </label>

                    {/* Fit mode selector */}
                    <div className="mb-3.5">
                      <div className="text-[10px] text-gray-400 mb-1.5 uppercase">自适应对齐模式 (Fit Mode):</div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'cover', label: '智能填充 (Cover)' },
                          { id: 'contain', label: '完整置中 (Contain)' },
                          { id: 'fill', label: '强制拉伸 (Fill)' }
                        ].map((fit) => (
                          <button
                            key={fit.id}
                            type="button"
                            onClick={() => updateParam('photoFitMode', fit.id as any)}
                            className={`py-1 rounded-lg text-[9px] font-black border-2 transition-all cursor-pointer ${
                              params.photoFitMode === fit.id 
                                ? 'border-yellow-400 bg-yellow-400/15 text-white shadow-[1.5px_1.5px_0_#fbbf24]' 
                                : 'border-neutral-800 bg-black/20 text-gray-400 hover:text-white'
                            }`}
                          >
                            {fit.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Photo Scale Slider */}
                      <div>
                        <div className="flex justify-between text-[10px] uppercase text-gray-400 mb-1">
                          <span>局部画幅局部缩放 (PHOTO ZOOM)</span>
                          <span className="font-mono text-yellow-300">{params.photoScale !== undefined ? params.photoScale : 100}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="10" 
                          max="300" 
                          value={params.photoScale !== undefined ? params.photoScale : 100} 
                          onChange={(e) => updateParam('photoScale', parseInt(e.target.value))}
                          className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Photo Offset X Slider */}
                        <div>
                          <div className="flex justify-between text-[10px] uppercase text-gray-400 mb-1">
                            <span>水平移动 (SHIFT X)</span>
                            <span className="font-mono text-yellow-300">{params.photoOffsetX !== undefined ? params.photoOffsetX : 0}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="-100" 
                            max="100" 
                            value={params.photoOffsetX !== undefined ? params.photoOffsetX : 0} 
                            onChange={(e) => updateParam('photoOffsetX', parseInt(e.target.value))}
                            className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                          />
                        </div>

                        {/* Photo Offset Y Slider */}
                        <div>
                          <div className="flex justify-between text-[10px] uppercase text-gray-400 mb-1">
                            <span>垂直移动 (SHIFT Y)</span>
                            <span className="font-mono text-yellow-300">{params.photoOffsetY !== undefined ? params.photoOffsetY : 0}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="-100" 
                            max="100" 
                            value={params.photoOffsetY !== undefined ? params.photoOffsetY : 0} 
                            onChange={(e) => updateParam('photoOffsetY', parseInt(e.target.value))}
                            className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}


              {/* TAB 3: Bezel options */}
              {selectedTab === 'retro' && (
                <div className="space-y-4">
                  
                  {/* LCD Screen Lines adjustments */}
                  <div className="space-y-4">
                    
                    <div>
                      <div className="flex justify-between text-[10px] font-black text-pink-500 uppercase mb-1">
                        <span>液晶反光偏光片网格 (LCD GLASS DOTS)</span>
                        <span className="font-mono text-yellow-300">{params.lcdGridStrength}%</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mb-2 leading-tight">模拟硬件液晶面板像素点阵之间的缝隙感，极大地增强了画面的物化手办感。</p>
                      <input 
                        type="range" 
                        min="0" 
                        max="80" 
                        value={params.lcdGridStrength} 
                        onChange={(e) => updateParam('lcdGridStrength', parseInt(e.target.value))}
                        className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                      />
                    </div>

                    <div className="pt-3 border-t-2 border-dashed border-neutral-800">
                      <div className="flex justify-between text-[10px] font-black text-pink-500 uppercase mb-1">
                        <span>阴极显像管扫描线强度 (SCANLINES GLOW)</span>
                        <span className="font-mono text-yellow-300">{params.scanlineStrength}%</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mb-2 leading-tight">通过细微的水平信号行阻断线，复活上世纪街机显像管独特的怀旧显示颗粒。</p>
                      <input 
                        type="range" 
                        min="0" 
                        max="80" 
                        value={params.scanlineStrength} 
                        onChange={(e) => updateParam('scanlineStrength', parseInt(e.target.value))}
                        className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                      />
                    </div>

                  </div>

                </div>
              )}


              {/* TAB 4: Text overlays dialogue bubbles */}
              {selectedTab === 'text' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-black text-pink-500 block mb-2">经典 RPG 对话标语 (Dialogue Overlay TEXT)</label>
                    <textarea
                      placeholder="在这里输入点爆复古情怀的水墨歌词、对白或标语..."
                      value={params.textOverlay || ''}
                      onChange={(e) => updateParam('textOverlay', e.target.value)}
                      className="w-full h-20 text-xs bg-black/40 border-2 border-black rounded-xl p-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition font-mono shadow-inner"
                    />
                    <span className="text-[9px] text-gray-500 block mt-1 tracking-tighter uppercase">Suggested: English capital words, or short text for classic text cards</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      onClick={() => updateParam('textPosition', 'bottom')}
                      className={`py-1.5 rounded-lg text-[10px] font-black uppercase border-2 transition-all cursor-pointer ${
                        params.textPosition === 'bottom' ? 'border-yellow-400 bg-yellow-400/20 text-white' : 'border-neutral-850 bg-black/20 text-gray-400'
                      }`}
                    >
                      底部覆盖
                    </button>
                    <button
                      onClick={() => updateParam('textPosition', 'top')}
                      className={`py-1.5 rounded-lg text-[10px] font-black uppercase border-2 transition-all cursor-pointer ${
                        params.textPosition === 'top' ? 'border-yellow-400 bg-yellow-400/20 text-white' : 'border-neutral-850 bg-black/20 text-gray-400'
                      }`}
                    >
                      顶部覆盖
                    </button>
                    <button
                      onClick={() => updateParam('textOverlay', '')}
                      className="py-1.5 rounded-lg text-[10px] font-black uppercase border-2 border-black bg-rose-950/40 text-rose-400 hover:bg-rose-900/40 cursor-pointer"
                    >
                      清除文字
                    </button>
                  </div>

                  {/* 对白字体大小可以调节 */}
                  <div className="pt-3 border-t-2 border-dashed border-neutral-800">
                    <div className="flex justify-between text-[10px] font-black text-pink-500 uppercase mb-1">
                      <span>对白字体大小 (Dialogue Font Size)</span>
                      <span className="font-mono text-yellow-300">{params.textFontSize || 14}px</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mb-2 leading-tight">自由调节对话框内的对白字体大小，排版行距与折行策略将自动进行适配。范围：8px - 32px。</p>
                    <input 
                      type="range" 
                      min="8" 
                      max="32" 
                      value={params.textFontSize || 14} 
                      onChange={(e) => updateParam('textFontSize', parseInt(e.target.value))}
                      className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                    />
                  </div>

                  {/* 对白框高度调节 */}
                  <div className="pt-3 border-t-2 border-dashed border-neutral-800">
                    <div className="flex justify-between text-[10px] font-black text-pink-500 uppercase mb-1">
                      <span>对白框高度比例 (Dialogue Box Height)</span>
                      <span className="font-mono text-yellow-300">{params.dialogueBoxHeight || 32}%</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mb-2 leading-tight">自由拉伸对白框所占的纵向屏幕比例，系统将智能根据高度换算其能容纳的最大文字行数。范围：15% - 60%。</p>
                    <input 
                      type="range" 
                      min="15" 
                      max="60" 
                      value={params.dialogueBoxHeight || 32} 
                      onChange={(e) => updateParam('dialogueBoxHeight', parseInt(e.target.value))}
                      className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                    />
                  </div>

                  {/* 对白框间距缩进 */}
                  <div className="pt-3 border-t-2 border-dashed border-neutral-800">
                    <div className="flex justify-between text-[10px] font-black text-pink-500 uppercase mb-1">
                      <span>对白框左右边距 (Dialogue Box Padding / Width margin)</span>
                      <span className="font-mono text-yellow-300">{params.dialogueBoxPadding || 12}px</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mb-2 leading-tight">自由拉伸调节对白外框与游戏主屏幕左右两侧边缘的像素边距。范围：4px - 32px。</p>
                    <input 
                      type="range" 
                      min="4" 
                      max="32" 
                      value={params.dialogueBoxPadding || 12} 
                      onChange={(e) => updateParam('dialogueBoxPadding', parseInt(e.target.value))}
                      className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                    />
                  </div>

                  {/* 对白框垂直高度偏移 */}
                  <div className="pt-3 border-t-2 border-dashed border-neutral-800">
                    <div className="flex justify-between text-[10px] font-black text-pink-500 uppercase mb-1">
                      <span>对白框上下距离 (Dialogue Box Vertical Distance/Offset)</span>
                      <span className="font-mono text-yellow-300">{params.dialogueBoxYOffset !== undefined ? params.dialogueBoxYOffset : 12}px</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mb-2 leading-tight">调节对白框与屏幕顶部或底部的边框位移距离，可以随时避开核心画面主体。范围：2px - 48px。</p>
                    <input 
                      type="range" 
                      min="2" 
                      max="48" 
                      value={params.dialogueBoxYOffset !== undefined ? params.dialogueBoxYOffset : 12} 
                      onChange={(e) => updateParam('dialogueBoxYOffset', parseInt(e.target.value))}
                      className="w-full h-3 bg-[#111] rounded-lg border border-neutral-800 opacity-90 cursor-pointer accent-[#d43d6a]"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-black/30 rounded-xl border-2 border-black">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <ChevronRight className="h-4 w-4 text-[#a855f7] animate-pulse" />
                        对白逐字打字机动画 (Typewriter)
                      </span>
                      <span className="text-[8.5px] text-gray-500 pl-5 leading-normal">勾选后，文字在视频的前 (n - 1) 秒内逐个打出，剩下 1 秒保持静止</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={params.textTypewriter || false} 
                        onChange={(e) => updateParam('textTypewriter', e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#a855f7]" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-black/30 rounded-xl border-2 border-black">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
                      <ChevronRight className="h-4 w-4 text-emerald-400 animate-ping" />
                      光标闪烁提示符号 (_)
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={params.textBlinkingCursor} 
                        onChange={(e) => updateParam('textBlinkingCursor', e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#d43d6a]" />
                    </label>
                  </div>

                </div>
              )}

            </div>

          </div>

        </div>
      </main>

      {/* Retro aesthetic system footer with copyright card */}
      <footer className="mt-16 border-t-4 border-black bg-[#0a0a0c] py-8 text-center text-xs text-neutral-500 relative z-10" id="gb-footer">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-neutral-600">© 1998 - 2026 GAME BOY COLOR Retro Hardware Simulator. Created for Infinite Retro Art.</p>
          <p className="flex items-center gap-1 justify-center sm:justify-end text-neutral-400">
            精雕细琢 ‧ 还原硬件 ‧ 怀旧致敬 
            <Heart className="h-3 w-3 text-pink-500 fill-current animate-pulse" /> 
            像素艺术
          </p>
        </div>
      </footer>
      {/* Dynamic Video Rendering Process Overlay */}
      <AnimatePresence>
        {isRecording && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="max-w-md w-full bg-[#181a1f] border-4 border-black rounded-3xl p-8 shadow-[8px_8px_0_#000] relative">
              <div className="absolute top-0 left-12 right-12 h-1.5 bg-gradient-to-r from-teal-400 via-yellow-400 to-pink-500 rounded-b-full shadow" />
              
              <div className="w-20 h-20 bg-pink-500/10 rounded-full flex items-center justify-center animate-pulse mx-auto mb-6 border border-pink-500/20">
                <Film className="h-10 w-10 text-pink-500 animate-spin" />
              </div>

              <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1">
                正在编译 Apple Live Photo (Zipping Packages)
              </h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-tighter mb-6">
                Rendering Frame-by-Frame to High-Resolution Canvas
              </p>

              {/* Progress bar */}
              <div className="w-full bg-[#111] rounded-full h-4 border border-neutral-800 p-0.5 overflow-hidden mb-3">
                <div 
                  className="bg-gradient-to-r from-teal-400 via-yellow-400 to-pink-500 h-full rounded-full transition-all duration-100 ease-out flex items-center justify-end pr-2 text-[8px] font-black text-black"
                  style={{ width: `${recordProgress}%` }}
                >
                  {recordProgress > 10 ? `${recordProgress}%` : ''}
                </div>
              </div>

              <div className="text-[11px] font-mono font-bold text-yellow-400 uppercase tracking-wide">
                指示系统正在逐帧记录 Game Boy 画面... {recordProgress}%
              </div>

              <div className="mt-6 text-[9px] text-gray-400 border-t border-neutral-800/60 pt-4 leading-normal">
                提示：这会生成一个高保真 <strong>.ZIP 压缩文件</strong>，内含一张匹配的像素首帧 JPG 图片与一段像素动态 MP4 视频。系统传输至 iPhone iOS 17+ 后，可自动拼合或通过 intoLive 一键转为真 **Live Wallpaper 实况动态锁屏壁纸**！
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden input / player for Live Photo / Video source tracking */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          loop
          muted={soundtrackChoice === 'original' ? videoMuted : true}
          autoPlay={videoPlaying}
          playsInline
          className="hidden"
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setVideoDuration(videoRef.current.duration || 0);
            }
          }}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setVideoCurrentTime(videoRef.current.currentTime || 0);
            }
          }}
        />
      )}

      {customAudioUrl && (
        <audio
          ref={audioRef}
          src={customAudioUrl}
          loop
          className="hidden"
        />
      )}
    </div>
  );
}

