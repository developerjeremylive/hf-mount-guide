# hf-mount Guide - Solución Completa

## ¿Qué es hf-mount?

**hf-mount** monta repositorios de Hugging Face como sistemas de archivos locales. Los archivos se leen **bajo demanda** - no se descarga todo el modelo, solo lo que necesitas.

## Instalación

### Linux/macOS
```bash
curl -fsSL https://raw.githubusercontent.com/huggingface/hf-mount/main/install.sh | sh
```

### Verificar instalación
```bash
hf-mount --version
```

## Uso Básico

### 1. Montar un modelo público
```bash
hf-mount start repo openai-community/gpt2 /tmp/gpt2
```

### 2. Montar un modelo privado
```bash
export HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxx"
hf-mount start --hf-token $HF_TOKEN repo tu-usuario/tu-modelo-privado /tmp/modelo
```

### 3. Listar mounts activos
```bash
hf-mount status
```

### 4. Desmontar
```bash
hf-mount stop /tmp/gpt2
```

## Usar con Python/Transformers

Una vez montado, usa transformers normalmente:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

# Carga desde el path montado - NO descarga nada
model = AutoModelForCausalLM.from_pretrained("/tmp/gpt2")
tokenizer = AutoTokenizer.from_pretrained("/tmp/gpt2")

# Usa normalmente
inputs = tokenizer("Hello, my name is", return_tensors="pt")
outputs = model.generate(**inputs, max_new_tokens=20)
print(tokenizer.decode(outputs[0]))
```

## API Server Local

Para usar desde el navegador, iniciá el servidor:

```bash
cd hf-mount-guide
pip install flask transformers
python api_server.py
```

Luego abrí http://localhost:5000

## Modelos Recomendados para Prueba

| Modelo | Tamaño | Comando mount |
|--------|--------|----------------|
| gpt2 | ~500MB | `hf-mount start repo openai-community/gpt2 /tmp/gpt2` |
| TinyLlama | ~1GB | `hf-mount start repo TinyLlama/TinyLlama-1.1B-Chat-v1.0 /tmp/tinyllama` |
| Qwen | ~4GB | `hf-mount start repo Qwen/Qwen2.5-0.5B-Instruct /tmp/qwen` |

## Solución de Problemas

### "Permission denied"
```bash
# Necesitás tu HF_TOKEN para repos privados
export HF_TOKEN="hf_xxxx"
```

### "fuse: permission denied"
```bash
# En Linux, agrega tu usuario al grupo fuse
sudo usermod -a -G fuse $USER
# O reinicia sesión
```

### "mount: command not found"
```bash
# Instala fuse
# Ubuntu/Debian: sudo apt-get install fuse3
# macOS: brew install macfuse
```
