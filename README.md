code
Markdown
# 🎮 Retro Pixel Studio / 掌机像素画风转换器

[![React](https://img.shields.io/badge/React-19.0-blue?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.0-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

一个基于纯前端（React + HTML5 Canvas）实现的**高保真掌机与复古像素风图像转换引擎**。它能够将您上传的任意现代图片，无缝转换成具有 Game Boy、Nokia 3310 等复古硬件质感或极具艺术感的 16-Bit / 24-Bit 高位色像素画。

---

## ✨ 核心特性

### 🎨 丰富的色彩配置 (Color Palettes & Bit Spaces)
* **经典复古色板**：完美还原原生 Game Boy (DMG-01)、经典诺基亚 (Nokia 3310)、口袋银灰 (GB Pocket)、以及多款 Game Boy Color (GBC) 风格色彩空间。
* **高画质色值阶梯**：
  * **16-Bit 像素风格**：还原 90 年代经典主机（R5G6B5色域，共 65,536 色）的怀旧质感。
  * **24-Bit 颜色风格**：提供现代 Full-RGB 真彩色下的极致像素艺术颗粒感。
  * **16/24-Bit 灰阶像素**：从细致的 4-bit 灰度（16种灰阶）到丝滑的 8-bit（256种灰阶）黑白相片美学。
* **自定义色控**：支持完全自定义调色板，打造专属特定硬件风格。

### 🏁 高级抖动与量化算法 (Precision Dithering)
* **Ordered Dithering (有序抖动)**：支持 Bayer 2x2, 4x4, 8x8 算法，赋予图像均匀有序的网点质感。
* **Error Diffusion Dithering (误差扩散抖动)**：内置高保真度的 Floyd-Steinberg 算法，自适应光影过渡，使图像在低色彩饱和下仍能细腻平滑。

### 📺 真实硬件仿真滤镜 (Aesthetic Overlays)
* **LCD 像素缝隙**：模拟绝版老液晶屏标志性的点阵颗粒感与物理暗角缝隙。
* **复古扫描线 (Scanlines)**：重现老式 CRT 监视器或早期手持式掌机屏幕的横向光栅纹理。
* **对比度与曝光微调**：底层采用精准的 Canvas 无损颜色变换通道，支持亮度、对比度、饱和度、锐度及 Gamma 参数的实时直观阻尼调节。

### 🖼️ 掌机相框定制 (Console Frames)
* 能够将处理好的像素图片，渲染在精美仿真的游戏掌机外壳相框中，一键保存带有机身包边、按键质感的完美渲染图。

---

## 🛠️ 技术实现与架构

* **前端框架**：`React 19` + `TypeScript` 带来安全且现代的组件化开发体验。
* **样式处理**：`Tailwind CSS v4` 配合原生 CSS 变量，构建轻量、响应式且极高颜值的现代化控制台 UI。
* **动画引擎**：利用 `Motion` (原 Framer Motion) 构建丝滑、具有物理弹性手感的操作控制。
* **核心渲染**：依靠原生高效率 `HTML5 Canvas`。通过离屏像素数据量化技术 (`ImageData` 双缓冲区处理器)，不仅在低分辨下表现出色，还确保了大型图片在毫秒级微调时的实时渲染回显。

---

## 🚀 快速启动

### 1. 克隆代码仓库
```bash
git clone https://github.com/YourUsername/your-repo-name.git
cd your-repo-name
2. 安装依赖项
code
巴什
npm install
3. 启动本地开发服务端口 (3000）
code
巴什
npm run dev
4. 预览与构建
在浏览器中打开 http://localhost:3000 即可开始使用：
code
巴什
# 执行生产环境优化构建
npm run build
📸 部分演示与效果对照
(可以在此处上传转换前后的像素图片作为仓库的 Banner 封面)
原始输入图像	16-Bit Bayer 抖动转换	经典 Game Boy DMG 绿阶
🌅 现代高清照片	👾 经典 16-Bit 点阵	📱 4-Color 复古 LCD
📄 许可证信息
本项目采用 MIT许可证 许可协议开源。您可以自由学习、分发及修改该代码。

