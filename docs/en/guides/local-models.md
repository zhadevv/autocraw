# Local models

AI mode and `extract` work with any OpenAI-compatible server, with Anthropic, or with Ollama. autocraw does not run or bundle a model itself: it is a Node.js tool, and it talks to whatever inference server you already have running, the same way it talks to OpenAI or Anthropic.

## Option 1: Ollama

```sh
ollama serve
ollama pull llama3.1
zac discover your-site.example --markdown ai --ai-provider ollama --ai-model llama3.1
```

No API key is needed. If `OLLAMA_BASE_URL` or `OLLAMA_MODEL` is set and no OpenAI/Anthropic key is configured, `--ai-provider ollama` is picked automatically. Default base URL is `http://localhost:11434`; override it with `--ai-base-url` or `OLLAMA_BASE_URL`.

## Option 2: any OpenAI-compatible server

llama.cpp's `llama-server`, LM Studio, text-generation-webui, vLLM and others expose an OpenAI-style `/v1/chat/completions` endpoint. Point autocraw at it with `--ai-provider openai` and its base URL; most of these servers ignore the API key, so any non-empty string works unless the server enforces one:

```sh
zac extract your-site.example/product --ai-provider openai --ai-base-url http://localhost:8080/v1 --api-key not-needed --schema product.schema.json
```

## Downloading a GGUF model

`zac models` manages plain `.gguf` files in `<cache>/models` (`~/.cache/autocraw/models` by default, or `AUTOCRAW_CACHE_DIR`). It only downloads and stores the file; it does not load or run it.

```sh
zac models pull TheBloke/Mistral-7B-Instruct-v0.2-GGUF
zac models pull TheBloke/Mistral-7B-Instruct-v0.2-GGUF:mistral-7b-instruct-v0.2.Q4_K_M.gguf
zac models list
zac models remove mistral-7b-instruct-v0.2.Q4_K_M.gguf
```

Without a file name, autocraw lists the repo's files and picks a `Q4_K_M` quantization if one exists, otherwise the smallest `.gguf`. The sha256 printed after a download is for you to compare against the repo yourself; autocraw does not fetch or trust a hash from Hugging Face. `zac install owner/name[:file.gguf]` is a shorter alias for `zac models pull`.

To actually run a downloaded file, load it into your own inference server, for example:

```sh
ollama create my-model -f Modelfile   # Modelfile pointing FROM ./the-file.gguf
# or
llama-server -m ~/.cache/autocraw/models/the-file.gguf --port 8080
```

Then use Option 1 or Option 2 above.

## Community picks (verified)

The lists below are community-maintained reference picks, not recommendations by autocraw. Every repo was checked against the Hugging Face Hub on 2026-11-13 (via the Hub's API/MCP) and returned a public model page. That only confirms the repo exists, it says nothing about quality, and the claims in the notes come from the list contributors. Entries whose repos were private, gated, or not found were left out.

Memory numbers are rough estimates for the common `Q4_K_M` quantization plus runtime overhead (KV cache), not official figures. Check the repo's file tree for exact sizes, and the model card for the license before using a model. A license marked "other" is not open source, or has extra terms. Benchmark figures in the "Source/benchmark" column are contributor claims from the shortlist, not results measured by autocraw — verify them yourself before relying on them.

### Text LLMs · light (roughly 0.5–6 GB file)

| # | Model | URL (repo) | Mem min | Mem recommended | License | Sumber/Benchmark | Notes |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| 1 | Qwen2.5-0.5B-Instruct (Q4_K_M) | [tensorblock/Qwen2.5-0.5B-Instruct-GGUF](https://huggingface.co/tensorblock/Qwen2.5-0.5B-Instruct-GGUF) | 2 GB | 4 GB | Apache-2.0 | — | Light chat, simple JSON, thin code |
| 2 | SmolLM2-360M-Instruct | [prithivMLmods/SmolLM2-360M-F32-GGUF](https://huggingface.co/prithivMLmods/SmolLM2-360M-F32-GGUF) | 2 GB | 4 GB | check card | — | Very light, fast short chat |
| 3 | Gemma 3 270M IT | [daniloreddy/gemma-3-270m-it_GGUF](https://huggingface.co/daniloreddy/gemma-3-270m-it_GGUF) | 2 GB | 4 GB | check card | — | Basic instruction following |
| 4 | Zyn Dwarf 1.0 | [itsZyn/ZynDwarf-1.0](https://huggingface.co/itsZyn/ZynDwarf-1.0) | 2 GB | 4 GB | check card | — | Mini code specialist |
| 5 | Qwen2.5-0.5B-Instruct-heretic | [saidutta69/Qwen2.5-0.5B-Instruct-heretic](https://huggingface.co/saidutta69/Qwen2.5-0.5B-Instruct-heretic) | 2 GB | 4 GB | check card | — | Uncensored small variant |
| 6 | MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-heretic | [saidutta69/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-heretic](https://huggingface.co/saidutta69/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-heretic) | 4 GB | 8 GB | check card | — | Uncensored, tool-calling tuned |
| 7 | LFM2.5-1.2B-Thinking-heretic | [saidutta69/LFM2.5-1.2B-Thinking-heretic](https://huggingface.co/saidutta69/LFM2.5-1.2B-Thinking-heretic) | 4 GB | 8 GB | check card | MATH-500 & IFEval decent (claim) | Edge reasoning focus |
| 8 | Bella-Bartender-1B-Heretic | [mradermacher/bella-bartender-heretic-1b-i1-GGUF](https://huggingface.co/mradermacher/bella-bartender-heretic-1b-i1-GGUF) | 4 GB | 8 GB | check card | — | Llama 3.2 1B, abliterated |
| 9 | Spark-X2.6-1.7B-GGUF | [XHToken/Spark-X2.6-1.7B-GGUF](https://huggingface.co/XHToken/Spark-X2.6-1.7B-GGUF) | 4 GB | 8 GB | check card | — | On-device agent tasks |
| 10 | LFM3-1.7B-GGUF | [LiquidAI/LFM3-1.7B-GGUF](https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF) | 4 GB | 8 GB | other | — | Trending, fast small chat |
| 11 | LFM3-1.7B-Uncensored-GGUF | [AtomicChat/LFM3-1.7B-Uncensored-GGUF](https://huggingface.co/AtomicChat/LFM3-1.7B-Uncensored-GGUF) | 4 GB | 8 GB | other | — | Uncensored variant of #10 |
| 12 | Qwen-4B-Sagui-Vision-Thinking-Code | [sysrobson/Qwen-4B-Sagui-Vision-Thinking-Code-GGUF](https://huggingface.co/sysrobson/Qwen-4B-Sagui-Vision-Thinking-Code-GGUF) | 6 GB | 12 GB | check card | HumanEval-TS 44.0% (claim) | Thinking + image input + TS code |
| 13 | MiniCPM5-2B-Claude-Fable5-heretic | [saidutta69/MiniCPM5-2B-Claude-Fable5-heretic](https://huggingface.co/saidutta69/MiniCPM5-2B-Claude-Fable5-heretic) | 6 GB | 12 GB | check card | — | Uncensored agentic, JSON tools |
| 14 | Mirxa3.5-2B-Uncensored-Aggressive | [mirxa2/mirxa3.5-2B-Uncensored-Aggressive](https://huggingface.co/mirxa2/mirxa3.5-2B-Uncensored-Aggressive) | 6 GB | 12 GB | check card | 0/465 refusals (claim) | Fully uncensored, multimodal |
| 15 | LFM2.5-1.2B-Nova-Function-Calling | [NovachronoAI/LFM2.5-1.2B-Nova-Function-Calling-GGUF](https://huggingface.co/NovachronoAI/LFM2.5-1.2B-Nova-Function-Calling-GGUF) | 4 GB | 8 GB | check card | JSON structure accuracy 97% (claim) | JSON-valid function calling |
| 16 | Spark-X2.6-4B-GGUF | [XHToken/Spark-X2.6-4B-GGUF](https://huggingface.co/XHToken/Spark-X2.6-4B-GGUF) | 6 GB | 12 GB | Apache-2.0 | — | On-device agent model, 4B |
| 17 | Parable-Qwen3-4B-Claude-Fable-5 | [AnkitAI/Parable-Qwen3-4B-Claude-Fable-5](https://huggingface.co/AnkitAI/Parable-Qwen3-4B-Claude-Fable-5) | 6 GB | 12 GB | check card | HumanEval 74.4 (claim) | Fine-tune of a Claude agent session |
| 18 | Qwen3.5-4B-Abliterated-PMRA | [Asystemoffields/Huihui-Qwen3.5-4B-Abliterated-PMRA-GGUF](https://huggingface.co/Asystemoffields/Huihui-Qwen3.5-4B-Abliterated-PMRA-GGUF) | 6 GB | 12 GB | check card | — | Uncensored, PMRA mixed quantization |
| 19 | Qwen3.5-4B-Uncensored-HauhauCS-Aggressive | [HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive](https://huggingface.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive) | 6 GB | 12 GB | check card | — | Aggressive uncensored |
| 20 | DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic (GGUF) | [mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-GGUF](https://huggingface.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-GGUF) | 8 GB | 16 GB | check card (base: Apache-2.0) | Refusal 3/100 after abliteration; fine-tuned on ~250K math/STEM samples from DeepSeek-V4-Pro (claim) | Q4_K_M ~5.8 GB; Q8_0 ~9.8 GB; separate `mmproj` for image input |
| 21 | DeepSeek-V4-Pro-Qwen3.5-9B-MTP (GGUF) | [Jackrong/DeepSeek-V4-Pro-Qwen3.5-9B-MTP-GGUF](https://huggingface.co/Jackrong/DeepSeek-V4-Pro-Qwen3.5-9B-MTP-GGUF) | 8 GB | 16 GB | Apache-2.0 | — | MTP variant of the 9B DeepSeek-derived model |
| 22 | BotPsy-0.8B (GGUF) | [qvac/BotPsy-0.8B-GGUFs](https://huggingface.co/qvac/BotPsy-0.8B-GGUFs) | 2 GB | 4 GB | Apache-2.0 | — | Agentic tool-calling, on-device |
| 23 | dale-0.8b (GGUF) | [manuelgscom/dale-0.8b-GGUF](https://huggingface.co/manuelgscom/dale-0.8b-GGUF) | 2 GB | 4 GB | Apache-2.0 | — | Shell / bash command model |
| 24 | NVIDIA-Nemotron-3.5-Bolt-E4B (GGUF) | [unsloth/NVIDIA-Nemotron-3.5-Bolt-E4B-GGUF](https://huggingface.co/unsloth/NVIDIA-Nemotron-3.5-Bolt-E4B-GGUF) | 6 GB | 12 GB | other | — | Small edge model, many languages |

### Text LLMs · medium to large (roughly 10–50 GB file)

| # | Model | URL (repo) | Mem min | Mem recommended | License | Sumber/Benchmark | Notes |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| 25 | Qwen3.8-27B-Uncensored (GGUF) | [JonathanColetti/Qwen3.8-27B-Uncensored-GGUF](https://huggingface.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF) | 20 GB | 32 GB | Apache-2.0 | — | Trending, llama.cpp, uncensored |
| 26 | Ternary-Bonsai-2-27B (GGUF) | [prism-ml/Ternary-Bonsai-2-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf) | 8 GB | 16 GB | Apache-2.0 | — | Ternary 2-bit quant, on-device friendly |
| 27 | Swift-1.5-Qwen3.8-27B (GSQ-RCO GGUF) | [ukisai/Swift-1.5-Qwen3.8-27B-GSQ-RCO-GGUF](https://huggingface.co/ukisai/Swift-1.5-Qwen3.8-27B-GSQ-RCO-GGUF) | 20 GB | 32 GB | other | — | Efficient-thinking 27B |
| 28 | Qwen3.8-27B (IQ4_XS / Q4_K_M / Q5_K_M / Q3_K_M / Q6_K) | [bowmanslayer/Qwen3.8-27B-GGUF](https://huggingface.co/bowmanslayer/Qwen3.8-27B-GGUF) | 20 GB (Q4) | 32 GB | check card | — | Balanced 27B family; Q8 ~28 GB |
| 29 | Qwen3.8-27B (IQ4_KS, agentic coding) | [ji-farthing/Qwen3.8-27B-ik-llama-GGUF](https://huggingface.co/ji-farthing/Qwen3.8-27B-ik-llama-GGUF) | 20 GB | 32 GB | check card | — | Importance-matrix quant for coding |
| 30 | Qwen3.8-27B (Q4_K_M) | [unsloth/Qwen3.8-27B-GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF) | 20 GB | 32 GB | check card | — | Speed/quality sweet spot |
| 31 | Qwen3.8-27B-TURBO-Fable-Cold-Fusion (Uncensored, IQ4_XS / Q4_K_M) | [Solstice-AI/Qwen3.8-27B-TURBO-Fable-Cold-Fusion-735-882-Heretic-Uncensored-GGUF-UltraOptimised-DSpark-MTP](https://huggingface.co/Solstice-AI/Qwen3.8-27B-TURBO-Fable-Cold-Fusion-735-882-Heretic-Uncensored-GGUF-UltraOptimised-DSpark-MTP) | 20 GB | 32 GB | check card | LiveCodeBench 90.3% (claim) | Uncensored + strong coding (~16.6–18 GB) |
| 32 | Zwielicht-27B | [Nimbz/Zwielicht-27B](https://huggingface.co/Nimbz/Zwielicht-27B) | 20 GB | 32 GB | check card | — | Creative 27B merge, thinking preserved |
| 33 | G4-LuneLight-31B | [zerofata/G4-LuneLight-31B](https://huggingface.co/zerofata/G4-LuneLight-31B) | 24 GB | 40 GB | check card | — | Creative/RP fits Gemma 4 |
| 34 | Gemma 4 31B IT | [google/gemma-4-31B-it](https://huggingface.co/google/gemma-4-31B-it) | 24 GB | 40 GB | check card | — | Official, multimodal document workflows |
| 35 | GLM-4.7-Flash (31B MoE) | [zai-org/GLM-4.7-Flash](https://huggingface.co/zai-org/GLM-4.7-Flash) | 20 GB | 32 GB | check card | — | Fast MoE, heavy thinking block |
| 36 | Q3.5-BlueStar-v2-27B | [zerofata/Q3.5-BlueStar-v2-27B](https://huggingface.co/zerofata/Q3.5-BlueStar-v2-27B) | 20 GB | 32 GB | check card | — | Creative Qwen 3.5 based |
| 37 | MS3.2-PaintedFantasy-v4.1-24B | [zerofata/MS3.2-PaintedFantasy-v4.1-24B](https://huggingface.co/zerofata/MS3.2-PaintedFantasy-v4.1-24B) | 20 GB | 32 GB | check card | — | RP model, optional thinking mode |
| 38 | OrcaSAQ-2-Cyber-27B-Uncensored (GGUF) | [orcarouter/OrcaSAQ-2-Cyber-27B-Uncensored-GGUF](https://huggingface.co/orcarouter/OrcaSAQ-2-Cyber-27B-Uncensored-GGUF) | 20 GB | 32 GB | Apache-2.0 | — | Uncensored, mixed-precision 27B |
| 39 | Qwen3-Coder-480B-A35B-Instruct | [Qwen/Qwen3-Coder-480B-A35B-Instruct](https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct) | 64 GB+ | 128 GB+ | check card | SWE-bench Verified 66.5% (claim) | Reference only |
| 40 | Devstral-Small-2507 | [mistralai/Devstral-Small-2507](https://huggingface.co/mistralai/Devstral-Small-2507) | 24 GB | 40 GB | check card | — | Coding-agent model |
| 41 | gpt-oss-120b | [openai/gpt-oss-120b](https://huggingface.co/openai/gpt-oss-120b) | 48 GB | 80 GB | Apache-2.0 | — | Reasoning at 120B scale |
| 42 | Phi-4-mini-instruct | [microsoft/Phi-4-mini-instruct](https://huggingface.co/microsoft/Phi-4-mini-instruct) | 4 GB | 8 GB | MIT | — | CPU-friendly, weak hardware |
| 43 | Qwen3-8B | [Qwen/Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B) | 8 GB | 16 GB | Apache-2.0 | — | Default local LLM family baseline |
| 44 | Gemma 3 27B IT | [google/gemma-3-27b-it](https://huggingface.co/google/gemma-3-27b-it) | 20 GB | 32 GB | Gemma terms | — | Strong single-GPU multimodal |

### OCR / document-to-Markdown

| # | Model | URL (repo) | Mem min | Mem recommended | License | Sumber/Benchmark | Notes |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| 45 | OvisOCR2 | [ATH-MaaS/OvisOCR2](https://huggingface.co/ATH-MaaS/OvisOCR2) | 4 GB | 8 GB | check card | OmniDocBench v1.6 96.58 (claim) | Page-to-Markdown, tables and formulas |
| 46 | NVIDIA-Nemotron-Parse-2.0 | [nvidia/NVIDIA-Nemotron-Parse-2.0](https://huggingface.co/nvidia/NVIDIA-Nemotron-Parse-2.0) | 4 GB | 8 GB | check card | — | Text, boxes, reading order, chart-to-table |
| 47 | HunyuanOCR | [tencent/HunyuanOCR](https://huggingface.co/tencent/HunyuanOCR) | 4 GB | 8 GB | check card | — | Multilingual document parsing, llama.cpp deploy |
| 48 | PaddleOCR-VL-1.6 | [PaddlePaddle/PaddleOCR-VL-1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6) | 4 GB | 8 GB | check card | 96.33 (claim) | Multilingual tables, formulas, charts |
| 49 | Unlimited-OCR (Baidu) | [baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR) | 8 GB | 16 GB | check card | Reads 40+ page batches with constant memory (claim) | Document OCR at scale |
| 50 | chandra-ocr-2 | [datalab-to/chandra-ocr-2](https://huggingface.co/datalab-to/chandra-ocr-2) | 10 GB | 16 GB | check card | — | Documents and handwriting to Markdown/HTML/JSON |
| 51 | dots.mocr | [dots-studio/dots.mocr](https://huggingface.co/dots-studio/dots.mocr) | 6 GB | 12 GB | check card | — | Multilingual text recognition + document parsing |
| 52 | MinerU2.5-Pro-2605-1.2B | [opendatalab/MinerU2.5-Pro-2605-1.2B](https://huggingface.co/opendatalab/MinerU2.5-Pro-2605-1.2B) | 4 GB | 8 GB | check card | — | Structured JSON and Markdown from documents |
| 53 | Infinity-Parser2-Pro | [infly/Infinity-Parser2-Pro](https://huggingface.co/infly/Infinity-Parser2-Pro) | 24 GB | 40 GB | check card | — | EN/ZH documents to Markdown/layout |
| 54 | MonkeyOCRv2-S-Parsing | [zenosai/MonkeyOCRv2-S-Parsing](https://huggingface.co/zenosai/MonkeyOCRv2-S-Parsing) | 2 GB | 4 GB | check card | — | Small parsing checkpoint |
| 55 | surya-ocr-2 | [datalab-to/surya-ocr-2](https://huggingface.co/datalab-to/surya-ocr-2) | 2 GB | 4 GB | check card | — | Layout and tables |
| 56 | TeleOCR | [XingChen-AGI/TeleOCR](https://huggingface.co/XingChen-AGI/TeleOCR) | 4 GB | 8 GB | check card | — | Digital + camera-captured pages |

### Audio, video and image

| # | Model | URL (repo) | Mem min | Mem recommended | License | Sumber/Benchmark | Notes |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| 57 | Kokoro-82M (TTS) | [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | 1 GB | 2 GB | Apache-2.0 | ~100x realtime on GPU (claim) | 82M params, 11 languages |
| 58 | Chatterbox (TTS) | [ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox) | 2 GB | 4 GB | MIT | — | Voice cloning from short reference audio |
| 59 | Orpheus (TTS, Llama 3.2) | [canopylabs/orpheus-3b-0.1-ft](https://huggingface.co/canopylabs/orpheus-3b-0.1-ft) | 6 GB | 12 GB | check card | — | Emotion tags, high-fidelity output |
| 60 | Fish Speech 1.5 (TTS) | [fishaudio/fish-speech-1.5](https://huggingface.co/fishaudio/fish-speech-1.5) | 6 GB | 12 GB | CC-BY-NC-SA | 80+ languages (claim) | Commercial use needs a license |
| 61 | HunyuanVideo 1.5 | [Tencent/HunyuanVideo](https://huggingface.co/Tencent/HunyuanVideo) | 20 GB | 32 GB | check card | — | Video generation, ~16–20 GB FP16 |
| 62 | LTX-Video | [Lightricks/LTX-Video](https://huggingface.co/Lightricks/LTX-Video) | 12 GB | 16 GB | check card | Near real-time (claim) | 16 GB VRAM friendly |
| 63 | CogVideoX | [THUDM/CogVideo](https://huggingface.co/THUDM/CogVideo) | 12 GB | 24 GB | check card | — | ComfyUI ecosystem, LoRA fine-tuning |
| 64 | MiniMax-H3-Image | [MiniMaxAI/MiniMax-H3-Image](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image) | 24 GB | 48 GB | check card | Rank 1 open-weight text-to-image (claim) | 4K, 16 reference images |

## What autocraw deliberately does not do

- It does not embed a Python runtime, `llama-cpp-python`, or any model inference engine. Doing so would make a Node.js CLI depend on a separate language and a multi-gigabyte native stack, which is a maintenance and install-size cost this project is not taking on.
- It does not ship, recommend or default to any specific model, including ones marketed as having safety mitigations removed. Pick and run your own model with your own inference server; autocraw only talks to its API.
- `zac serve` is autocraw's own scraping REST API (see [Server API](../server-api.md)); it does not start or manage a model server. Run your inference server separately.
