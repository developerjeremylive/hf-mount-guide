# Guía Completa: hf-mount & hf-csi-driver

> Monta repositorios y buckets de Hugging Face como sistemas de archivos locales sin descargar nada.

---

## 🎯 ¿Qué es hf-mount?

**hf-mount** es una herramienta que expone repositorios de modelos, datasets y buckets de Hugging Face como un sistema de archivos local mediante FUSE o NFS. La clave: **los archivos se cargan bajo demanda** — solo se descargan los bytes que tu código realmente toca.

```
hf-mount start bucket myuser/my-bucket /tmp/data
hf-mount start repo openai/gpt-oss-20b /tmp/gpt-oss
```

### ¿Por qué es revolucionario?

- **Sin descarga completa**: Acceso inmediato a terabytes de datos sin esperar克隆
- **Lazy loading**: Solo se fetchea lo que necesitas
- **API simple**: Usa herramientas UNIX (ls, cat, find, grep) — no necesitas SDKs complejos
- **Compatible con tu código existente**: `from_pretrained("/tmp/gpt-oss")` funciona directamente

---

## 🚀 ¿Qué puedes hacer con hf-mount?

### 1. **Montar Repositorios de Modelos**

Accede a cualquier modelo en Hugging Face Hub como si estuviera en tu disco local.

```bash
# Modelo público (sin token)
hf-mount start repo openai/gpt-oss-20b /tmp/model

# Modelo privado (requiere token)
hf-mount start --hf-token $HF_TOKEN repo myorg/my-private-model /tmp/model

# Dataset
hf-mount start repo datasets/open-index/hacker-news /tmp/hn

# Revisión específica
hf-mount start repo openai-community/gpt2 /tmp/gpt2 --revision v1.0

# Solo un subfolder
hf-mount start repo openai-community/gpt2/onnx /tmp/onnx
```

**Caso de uso típico**: Carga modelos grandes sin ocupar disco:

```python
from transformers import AutoModelForCausalLM

# ¡Sin descargar! Lee bajo demanda
model = AutoModelForCausalLM.from_pretrained("/tmp/gpt-oss")
```

### 2. **Montar Buckets (Almacenamiento S3-like)**

Los buckets son almacenamiento objeto mutable diseñado para datos grandes sin versionado git (checkpoints, logs, artifacts).

```bash
# Bucket privado
hf-mount start --hf-token $HF_TOKEN bucket myuser/my-bucket /tmp/data

# Solo lectura
hf-mount start --hf-token $HF_TOKEN --read-only bucket myuser/my-bucket /tmp/data

# Subfolder específico
hf-mount start --hf-token $HF_TOKEN bucket myuser/my-bucket/checkpoints /tmp/ckpts
```

### 3. **Explorar Contenido sin Clonar**

Usa herramientas UNIX estándar para navegar repositorios:

```bash
ls /tmp/gpt2              # Ver estructura
cat /tmp/gpt2/config.json # Leer archivos
find /tmp/gpt2 -name "*.safetensors" | head -5  # Buscar
grep -r "vocab_size" /tmp/gpt2/  # Buscar contenido
```

### 4. **Escritura en Buckets**

hf-mount soporta escritura en buckets (no en repos):

```bash
# Modo streaming (default) - append-only, en memoria
echo "nuevos datos" >> /tmp/data/logs.txt
# Se sube cuando cierras el archivo

# Modo avanzado (--advanced-writes) - random writes, seek, overwrite
# Descarga el archivo completo a disco primero, permite edición completa
# Flush asíncrono con debounce de 2s
```

**⚠️ Importante**: El modo streaming no funciona con editores de texto (vim, nano). Usa `--advanced-writes` para eso.

---

## 🔧 Instalación

### Instalación rápida (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/huggingface/hf-mount/main/install.sh | sh
```

Instala en `~/.local/bin/`. Configura `INSTALL_DIR` para cambiar la ubicación.

### Binarios pre-compilados

| Platform | NFS | FUSE |
|----------|-----|------|
| Linux x86_64 | hf-mount-nfs-x86_64-linux | hf-mount-fuse-x86_64-linux |
| Linux aarch64 | hf-mount-nfs-aarch64-linux | hf-mount-fuse-aarch64-linux |
| macOS Apple Silicon | hf-mount-nfs-arm64-apple-darwin | hf-mount-fuse-arm64-apple-darwin |

### Dependencias

- **NFS**: Sin dependencias (funciona en cualquier lado)
- **FUSE Linux**: `sudo apt-get install -y fuse3`
- **FUSE macOS**: [macFUSE](https://osxfuse.github.io/) (brew install macfuse, requiere reinicio)

### Compilación desde código

```bash
# Requiere Rust 1.85+

# Solo NFS
cargo build --release --features nfs

# Solo FUSE
cargo build --release --features fuse

# Ambos
cargo build --release --features fuse,nfs
```

---

## ⚙️ Opciones de Configuración

| Flag | Default | Descripción |
|------|---------|-------------|
| `--hf-token` | $HF_TOKEN | Token de Hugging Face (requerido para privados) |
| `--hub-endpoint` | https://huggingface.co | Endpoint del Hub |
| `--cache-dir` | /tmp/hf-mount-cache | Directorio de cache local |
| `--cache-size` | ~10 GB | Tamaño máximo del cache en bytes |
| `--read-only` | false | Montar solo lectura (always on para repos) |
| `--advanced-writes` | false | Habilitar staging files + async flush |
| `--poll-interval-secs` | 30 | Intervalo de polling para cambios remotos |
| `--metadata-ttl-ms` | 10000 | TTL del cache de metadatos (ms) |
| `--no-disk-cache` | false | Disable cache local (cada lectura va a HF) |
| `--fuse` | false | Usar backend FUSE en lugar de NFS |

---

## 📊 Modelo de Consistencia

hf-mount provee **consistencia eventual**:

- Los archivos pueden estar desactualizados hasta `--metadata-ttl-ms` (default 10s)
- No hay push notifications del Hub — todo depende de polling cliente
- Dos mecanismos de detección de cambios:
  - **Revalidación de metadatos** (FUSE only): dentro del TTL, revisa si el archivo cambió
  - **Polling en background** (default cada 30s): lista el árbol completo

### Streaming vs Advanced Writes

| Característica | Streaming (default) | Advanced (--advanced-writes) |
|----------------|---------------------|------------------------------|
| Patrón de escritura | Append-only | Random writes, seek, overwrite |
| Storage | Buffer en memoria | Archivo staging en disco |
| Modificar existentes | Solo overwrite (O_TRUNC) | Sí (download primero) |
| Durabilidad | On close | Async, debounced (2s/30s) |
| Espacio disco necesario | Ninguno | Tamaño completo por archivo |

**⚠️** Streaming mode pierde datos si hay crash antes de close(). Editors de texto no funcionan en modo streaming.

---

## ☸️ hf-csi-driver: Kubernetes

El **CSI driver** permite montar repos y buckets como volúmenes en pods de Kubernetes.

### Arquitectura

```
kubelet → CSI NodePublishVolume → mount pod (hf-mount-fuse) → FUSE mount → bind mount al target
```

- Cada mount corre en un **pod dedicado** que sobrevive reinicios del driver
- **Self-healing**: Los pods se recrean automáticamente desde el estado CRD
- **HFMount CRD**: Mantiene el estado de los mounts como fuente de verdad

### Instalación

```bash
# Con Helm (recomendado)
helm install hf-csi oci://ghcr.io/huggingface/charts/hf-csi-driver \
 --namespace kube-system

# O desde el repositorio local
helm install hf-csi deploy/helm/hf-csi-driver/ \
 --namespace kube-system
```

### Requisitos

- Kubernetes 1.26+
- FUSE en los nodos (/dev/fuse disponible, fuse3 instalado)
- Contenedores corriendo como privileged (requerido para FUSE + mount propagation)

### Ejemplo: Volume Inline (sin PV/PVC)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  containers:
  - name: app
    image: python:3.12
    command: ["python", "-c", "import os; print(os.listdir('/model'))"]
    volumeMounts:
    - name: gpt2
      mountPath: /model
      readOnly: true
  volumes:
  - name: gpt2
    csi:
      driver: hf.csi.huggingface.co
      readOnly: true
      volumeAttributes:
        sourceType: repo
        sourceId: openai-community/gpt2
      nodePublishSecretRef:
        name: hf-token
```

### Ejemplo: Static Provisioning con PV/PVC

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: gpt2-pv
spec:
  capacity:
    storage: 1Ti
  accessModes: [ReadOnlyMany]
  mountOptions:
    - read-only
  csi:
    driver: hf.csi.huggingface.co
    volumeHandle: gpt2
    nodePublishSecretRef:
      name: hf-token
      namespace: default
    volumeAttributes:
      sourceType: repo
      sourceId: openai-community/gpt2
      revision: main

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: gpt2-pvc
spec:
  accessModes: [ReadOnlyMany]
  resources:
    requests:
      storage: 1Ti
  volumeName: gpt2-pv
```

### Atributos de Volumen

| Atributo | Requerido | Default | Descripción |
|----------|-----------|---------|-------------|
| sourceType | sí | - | `bucket` o `repo` |
| sourceId | sí | - | HF identifier (e.g. username/my-bucket) |
| revision | no | main | Git revision (solo para repos) |
| hubEndpoint | no | https://huggingface.co | Endpoint del Hub |
| cacheDir | no | auto | Directorio de cache local |
| cacheSize | no | 10000000000 | Tamaño máximo del cache |
| pollIntervalSecs | no | 30 | Intervalo de polling |
| metadataTtlMs | no | 10000 | TTL del cache de metadatos |
| mountFlags | no | - | Flags para volumes inline (e.g. advanced-writes,uid=1000) |

### Passthrough de Mount Options

Los `mountOptions` del PV se traducen como flags CLI para hf-mount-fuse:

```yaml
mountOptions:
  - read-only
  - uid=1000
  - gid=1000
  - advanced-writes
```

---

## 🆚 NFS vs FUSE

| Característica | FUSE | NFS |
|----------------|------|-----|
| Revalidación de metadatos | Por archivo, dentro del TTL | No (usa file handles) |
| Invalidación de page cache | Soportada | No soportada por protocolo |
| Ventana de staleness | ~10s | Hasta poll interval (30s) |
| Write mode | Streaming por defecto | Advanced siempre |
| Dependencias | fuse3/macFUSE | Ninguna |
| Funciona sin root | No (FUSE necesita) | Sí |

**Recomendación**: NFS funciona en cualquier lado sin dependencias del kernel. FUSE ofrece mejor integración con el kernel y cache invalidation.

---

## 💡 Casos de Uso Ideales

### ✅ Perfecto para:

- Cargar modelos/datasets sin descargar el repo completo
- Browsing de contenido (ls, cat, find) sin clonar
- Workloads de lectura intensiva (training, inference, evaluación)
- Entornos con espacio en disco limitado

### ❌ No recomendado para:

- Filesystem network de propósito general (no multi-writer, no file locking)
- I/O aleatorio sensible a latencia (primeras lecturas van a la red)
- Workloads que necesitan consistencia fuerte (archivos pueden estar stale hasta 10s)
- Escritura concurrente pesada desde múltiples mounts (last writer wins)
- Editing con editores de texto en modo streaming (usa --advanced-writes)

---

## 🔄 Comandos Útiles

```bash
# Ver mounts activos
hf-mount status

# Parar y desmontar
hf-mount stop /tmp/data

# Logs
ls ~/.hf-mount/logs/

# PID files
ls ~/.hf-mount/pids/

# Desmontar manualmente
umount /tmp/data              # NFS o FUSE (macOS)
fusermount -u /tmp/data       # FUSE (Linux)
```

---

## 🔐 Autenticación

```bash
# Opción 1: Variable de entorno
export HF_TOKEN=hf_xxxxx
hf-mount start repo myorg/my-model /tmp/model

# Opción 2: Flag explícito
hf-mount start --hf-token $HF_TOKEN repo myorg/my-model /tmp/model

# Opción 3: Token file (re-lectura en cada request)
hf-mount start --token-file /path/to/token.txt repo myorg/my-model /tmp/model
```

Para crear un token: [HF Settings > Access Tokens](https://huggingface.co/settings/tokens)

---

## 🛠️ Debugging

```bash
RUST_LOG=hf_mount=debug hf-mount-fuse repo gpt2 /mnt/gpt2
```

Logs escritos a `~/.hf-mount/logs/`.

---

## 📦 Tecnologías Base

- **xet-core**: Content-addressed storage y transferencias eficientes
- **fuser**: Implementación FUSE en Rust

---

¿Tienes preguntas sobre algún caso de uso específico? ¡Puedo profundizar en cualquier sección!