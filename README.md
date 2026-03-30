# hf-mount Guide 🌐

> Monta repositorios y buckets de Hugging Face como sistemas de archivos locales sin descargar nada.

## 📄 Landing Page

El sitio web está disponible en: **Visitar [hf-mount-guide](https://developerjeremylive.github.io/hf-mount-guide/)**

*(Para habilitar GitHub Pages: Settings > Pages > Source: main branch)*

## 📚 Guía de Uso Completa

La guía detallada de hf-mount y hf-csi-driver está disponible en la wiki del repositorio o en la documentación oficial:

- [hf-mount README](https://github.com/huggingface/hf-mount#readme)
- [hf-csi-driver README](https://github.com/huggingface/hf-csi-driver#readme)

## 🚀 Quick Start

```bash
# Instalación
curl -fsSL https://raw.githubusercontent.com/huggingface/hf-mount/main/install.sh | sh

# Montar un modelo público
hf-mount start repo openai/gpt-oss-20b /tmp/model

# Acceder como si estuviera localmente
ls /tmp/model
python -c "from transformers import AutoModel; model = AutoModel.from_pretrained('/tmp/model')"
```

## 📂 Estructura del Proyecto

```
hf-mount-guide/
├── index.html      # Landing page
├── css/
│   └── style.css   # Estilos personalizados
├── js/
│   └── main.js     # Three.js y animaciones
└── README.md       # Este archivo
```

## 🎨 Tecnologías

- **Tailwind CSS** - Estilos
- **Three.js** - Animación 3D del background
- **Google Fonts** - Instrument Sans + Space Mono

## 📝 License

Apache-2.0 - Por Hugging Face