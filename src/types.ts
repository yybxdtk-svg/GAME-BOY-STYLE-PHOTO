export interface ColorPalette {
  id: string;
  name: string;
  colors: string[]; // hex values, e.g. ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"]
  isCustom?: boolean;
}

export type DitherType = 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'floyd' | 'halftone';

export interface ConverterParams {
  resolutionWidth: number;
  resolutionHeight: number;
  maintainAspectRatio: boolean;
  brightness: number;     // -100 to 100
  contrast: number;       // -100 to 100
  saturation: number;     // -100 to 100
  ditherType: DitherType;
  ditherAmount: number;   // 0 to 100
  paletteId: string;
  customColors: string[];
  lcdGridStrength: number; // 0 to 100
  scanlineStrength: number; // 0 to 100
  showConsoleLink: boolean; // overlay Gameboy bezel
  bezelColor: 'dmg' | 'yellow' | 'berry' | 'turquoise' | 'purple' | 'clear' | 'orange' | 'gold' | 'black' | 'blue' | 'green' | 'mint' | 'rose';
  textOverlay: string;
  textPosition: 'bottom' | 'top' | 'none';
  textBlinkingCursor: boolean;
  textFontSize: number; // in pixels, default starts around 10 to 14
  dialogueBoxHeight: number; // percentage of screen height (e.g. 15 to 60)
  dialogueBoxPadding: number; // horizontal and vertical padding pixels (e.g. 4 to 32)
  dialogueBoxYOffset: number; // vertical space/distance from screen top/bottom margin pixels (e.g. 2 to 60)
  powerLedColor: 'red' | 'green' | 'blue' | 'orange' | 'cyan' | 'off';
  consoleLogoText: string;
  consoleTextureAlpha: number; // 0 to 100
  photoScale: number; // 10 to 300, default 100
  photoOffsetX: number; // -100 to 100, default 0
  photoOffsetY: number; // -100 to 100, default 0
  photoFitMode: 'cover' | 'contain' | 'fill';
  textTypewriter?: boolean;
  edgeEnhancement?: boolean;
}

export const PRESET_PALETTES: ColorPalette[] = [
  {
    id: 'dmg_green',
    name: 'OG 经典绿 (DMG-01)',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
  },
  {
    id: 'nokia_3310',
    name: '经典诺基亚 (Nokia 3310)',
    colors: ['#1d200e', '#444927', '#6b723f', '#949b5c']
  },
  {
    id: 'gb_pocket',
    name: '口袋银灰 (GB Pocket)',
    colors: ['#2e302f', '#5c605e', '#8c9290', '#c2cbc7']
  },
  {
    id: 'matrix_matrix',
    name: '骇客帝国 (Matrix Green)',
    colors: ['#041203', '#004c00', '#008c00', '#32cd32']
  },
  {
    id: 'gameboy_light',
    name: '时光背光 (GB Light)',
    colors: ['#00181c', '#004d53', '#00838a', '#b5e3e6']
  },
  {
    id: 'gbc_chocolate',
    name: '古早巧克力 (Chocolate)',
    colors: ['#1f1005', '#572d11', '#a0522d', '#f4a460']
  },
  {
    id: 'cyberpunk_neon',
    name: '赛博霓虹 (Cyber Neon)',
    colors: ['#2b023d', '#7d0252', '#c60052', '#ff59b1']
  },
  {
    id: 'vaporwave_sunset',
    name: '蒸汽波落日 (Vaporwave)',
    colors: ['#1a0c47', '#5d1c82', '#a63c7b', '#ff8dc3']
  },
  {
    id: 'vintage_sepia',
    name: '琥珀滤镜 (Sepia)',
    colors: ['#211510', '#563e2d', '#997355', '#e9cab3']
  },
  {
    id: 'gbc_color_full',
    name: '8-Bit 缤纷色彩 (GBC)',
    colors: [
      '#000000', '#414141', '#7a7a7a', '#ffffff',
      '#7f0000', '#ff0000', '#7f3f00', '#ff7f00',
      '#7f7f00', '#ffff00', '#007f00', '#00ff00',
      '#007f7f', '#00ffff', '#00007f', '#0000ff'
    ]
  },
  {
    id: 'bit16_color',
    name: '16-Bit 像素风格',
    colors: []
  },
  {
    id: 'bit24_color',
    name: '24-Bit 颜色风格',
    colors: []
  },
  {
    id: 'bit16_grayscale',
    name: '16-Bit 灰阶像素',
    colors: []
  },
  {
    id: 'bit24_grayscale',
    name: '24-Bit 灰阶颜色风格',
    colors: []
  },
  {
    id: 'original_color',
    name: '原彩显示像素风格 (True Color)',
    colors: []
  },
  {
    id: 'monochrome_ob',
    name: '极简黑白 (Classic Mono)',
    colors: ['#000000', '#555555', '#aaaaaa', '#ffffff']
  }
];

export const SAMPLE_IMAGES = [
  {
    id: 'statue',
    name: '复古雕像',
    url: 'https://images.unsplash.com/photo-1549887534-1541e9326642?auto=format&fit=crop&q=80&w=600'
  },
  {
    id: 'pyramid',
    name: '神秘金字塔',
    url: 'https://images.unsplash.com/photo-1627856013091-fed6e4e30025?auto=format&fit=crop&q=80&w=600'
  },
  {
    id: 'cyber',
    name: '赛博街道',
    url: 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?auto=format&fit=crop&q=80&w=600'
  }
];
