import { useEffect, useState, useRef } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { QRCodeSVG } from 'qrcode.react'
import { BrowserMultiFormatReader } from '@zxing/browser'

/*
 * Modelo de espaços Holyrics (.txt) — referência real:
 * c:\Users\humberto.freitas\Downloads\HOLYRICS\007 (Cristo Cura, Sim!).txt
 *
 * Título: 007
 * Artista: Cristo Cura, Sim!
 *
 * [estrofe: várias linhas seguidas, SEM linha em branco entre elas]
 *
 * [próximo bloco: uma linha em branco separa estrofes/refrões]
 *
 * Ex.: após "POIS DE NÓS TEM DÓ." vem linha em branco, depois "CRISTO CURA, SIM,"
 */

/* Helper Functions for Recursive Folders */
const buildTreeFromFiles = (files) => {
  const root = { name: 'root', type: 'folder', children: [], isExpanded: true, path: '' }
  files.forEach((file) => {
    const pathParts = (file.webkitRelativePath || file.name).split('/').filter(Boolean)
    let currentLevel = root.children
    let accumulatedPath = ''
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]
      accumulatedPath += (accumulatedPath ? '/' : '') + part
      const isFile = i === pathParts.length - 1
      let existingNode = currentLevel.find((n) => n.name === part && (isFile ? n.type === 'file' : n.type === 'folder'))
      if (!existingNode) {
        existingNode = {
          id: accumulatedPath,
          name: part,
          type: isFile ? 'file' : 'folder',
          path: accumulatedPath,
          ...(isFile ? { file } : { children: [], isExpanded: i === 0 }),
        }
        currentLevel.push(existingNode)
      }
      if (!isFile) {
        currentLevel = existingNode.children
      }
    }
  })
  return root.children
}

const prefixNodeIds = (nodes, prefix) => {
  return nodes.map(n => ({
    ...n,
    id: `${prefix}/${n.id}`,
    children: n.children ? prefixNodeIds(n.children, prefix) : undefined
  }))
}

const toggleNodeExpansion = (nodes, id) => {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, isExpanded: !node.isExpanded }
    }
    if (node.children) {
      return { ...node, children: toggleNodeExpansion(node.children, id) }
    }
    return node
  })
}

const updateNodeContent = (nodes, id, contentData) => {
  return nodes.map(n => {
    if (n.id === id) return { ...n, ...contentData }
    if (n.children) return { ...n, children: updateNodeContent(n.children, id, contentData) }
    return n
  })
}

const getAllFileNodes = (nodes) => {
  let files = []
  nodes.forEach(n => {
    if (n.type === 'file') files.push(n)
    if (n.children) files = files.concat(getAllFileNodes(n.children))
  })
  return files
}

const runAiOptimization = async (text, apiKey, provider = 'openai') => {
  if (!text || text.trim().length === 0) return text
  try {
    const systemPrompt = 'Você é um assistente de edição de letras musicais de coral e igreja. Sua tarefa é corrigir pequenos erros ortográficos, remover duplicadas idênticas indesejadas (refrões excessivos), e padronizar o layout (1 linha em branco entre estrofes). Retorne APENAS a letra processada limpa, sem aspas, Markdown ou introduções.'
    
    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\nAqui está a letra original:\n${text}` }]
          }]
        })
      })
      const data = await response.json()
      if(data.error) throw new Error(data.error.message)
      return data.candidates[0].content.parts[0].text.replace(/```(txt|markdown)?/gi, '').trim()
    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true' // Permite o request a partir do browser
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }]
        })
      })
      const data = await response.json()
      if(data.error) throw new Error(data.error.message)
      return data.content[0].text.trim()
    } else {
      // Default: OpenAI
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          temperature: 0.2
        })
      })
      const data = await response.json()
      if(data.error) throw new Error(data.error.message)
      return data.choices[0].message.content.trim()
    }
  } catch (e) {
    console.error(`Erro na IA (${provider}):`, e)
    return text
  }
}

const generateHBACForBatch = (batchTitle, cleanedLyrics, exportedAt) => {
  return [
    '[HBAC]',
    `TITLE=${batchTitle}`,
    `DATE=${exportedAt}`,
    `LYRICS_LINES=${cleanedLyrics.split('\\n').length}`,
    `HAS_IMAGE=NO`,
    `HAS_AUDIO=NO`,
    '',
    '[LYRICS]',
    cleanedLyrics,
  ].join('\n')
}

function App() {
  const [title, setTitle] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [importedSongs, setImportedSongs] = useState([])
  const [selectedImportedSongIndex, setSelectedImportedSongIndex] = useState(0)
  const [folders, setFolders] = useState([]) // Array de { id, name, type, children, ... }
  const [selectedFileConfig, setSelectedFileConfig] = useState({ path: null })
  const [aiProvider, setAiProvider] = useState(localStorage.getItem('ai_provider') || 'openai')
  const [apiKey, setApiKey] = useState(localStorage.getItem(`${localStorage.getItem('ai_provider') || 'openai'}_api_key`) || '')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const [audioPreview, setAudioPreview] = useState('')
  const [donationQrFile, setDonationQrFile] = useState(null)
  const [donationQrPreview, setDonationQrPreview] = useState('')
  const [faviconFile, setFaviconFile] = useState(null)
  const [faviconPreview, setFaviconPreview] = useState('')
  const [message, setMessage] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrMode, setQrMode] = useState('generate') // generate | scan
  const [qrText, setQrText] = useState('')
  const [scanResult, setScanResult] = useState('')
  const [scanError, setScanError] = useState('')
  const videoRef = useRef(null)
  const codeReaderRef = useRef(null)

  useEffect(() => {
    if (showQrModal && qrMode === 'scan') {
      const codeReader = new BrowserMultiFormatReader()
      codeReaderRef.current = codeReader
      codeReader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
        if (result) {
          setScanResult(result.getText())
          codeReader.reset()
        }
      }).catch(e => setScanError('Câmera não suportada ou permissão negada.'))
      
      return () => {
        codeReader.reset()
        codeReaderRef.current = null
      }
    }
  }, [showQrModal, qrMode])
  const [slideFontSize, setSlideFontSize] = useState(42)
  const [selectedAction, setSelectedAction] = useState('auto-edit')
  const [isPresenting, setIsPresenting] = useState(false)
  const [autoSlideSeconds, setAutoSlideSeconds] = useState(4)
  const [autoSlideTimerId, setAutoSlideTimerId] = useState(null)
  const [selectedFileName, setSelectedFileName] = useState('Nenhum arquivo')
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [isFileModified, setIsFileModified] = useState(false)

  const readFileAsText = async (file) => {
    return file.text()
  }

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatDateOnly = (date) =>
    date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

  const formatTimeOnly = (date) =>
    date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

  const extractFolderNameFromFile = (file) => {
    const rel = file?.webkitRelativePath || ''
    if (!rel) return ''
    const parts = rel.split('/').filter(Boolean)
    return parts.length > 1 ? parts[0] : ''
  }

  // Java "modified UTF-8" decoder used in ObjectOutputStream strings.
  // Differences vs UTF-8: null char encoded as 0xC0 0x80. Everything else matches standard 2/3-byte forms.
  const decodeJavaModifiedUtf8 = (bytes, offset, length) => {
    const end = offset + length
    let out = ''
    let i = offset

    while (i < end) {
      const b1 = bytes[i++]
      if (b1 <= 0x7f) {
        out += String.fromCharCode(b1)
        continue
      }

      if ((b1 & 0xe0) === 0xc0) {
        const b2 = bytes[i++]
        const code = ((b1 & 0x1f) << 6) | (b2 & 0x3f)
        out += String.fromCharCode(code)
        continue
      }

      if ((b1 & 0xf0) === 0xe0) {
        const b2 = bytes[i++]
        const b3 = bytes[i++]
        const code = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)
        out += String.fromCharCode(code)
        continue
      }

      // Fallback: replace unsupported sequences.
      out += '�'
    }

    return out
  }

  // Best-effort extraction of strings from Java serialization stream.
  // TC_STRING (0x74): 2-byte length + modified UTF-8
  // TC_LONGSTRING (0x7C): 8-byte length + modified UTF-8
  const extractJavaSerializedStrings = (bytes) => {
    const strings = []

    for (let i = 0; i < bytes.length; i++) {
      const tc = bytes[i]

      if (tc === 0x74) {
        if (i + 2 >= bytes.length) continue
        const len = (bytes[i + 1] << 8) | bytes[i + 2]
        const start = i + 3
        const end = start + len
        if (end > bytes.length) continue
        strings.push(decodeJavaModifiedUtf8(bytes, start, len))
        i = end - 1
      } else if (tc === 0x7c) {
        if (i + 8 >= bytes.length) continue
        let len = 0n
        for (let k = 1; k <= 8; k++) {
          len = (len << 8n) | BigInt(bytes[i + k])
        }
        if (len > BigInt(Number.MAX_SAFE_INTEGER)) continue
        const n = Number(len)
        const start = i + 9
        const end = start + n
        if (end > bytes.length) continue
        strings.push(decodeJavaModifiedUtf8(bytes, start, n))
        i = end - 1
      }
    }

    return strings
  }

  const guessSongsFromExtractedStrings = (strings) => {
    const songs = []
    const isProbablyMetadata = (s) =>
      !s ||
      s.length < 2 ||
      s.length > 1400 ||
      s.includes('java.') ||
      s.includes('com.limagiran.') ||
      s.includes('Ljava/') ||
      s === 'lyrics' ||
      s === 'title' ||
      s === 'artist' ||
      s === 'titleToSearch' ||
      s === 'lyricsToSearch'

    const looksLikeLyrics = (s) => {
      if (!s) return false
      const nlCount = (s.match(/\n/g) || []).length
      if (nlCount >= 2) return true
      const spaceCount = (s.match(/\s/g) || []).length
      return s.length >= 120 && spaceCount >= 12
    }

    for (let i = 0; i < strings.length - 1; i++) {
      const a = strings[i]?.trim()
      const b = strings[i + 1]?.trim()

      if (!a || !b) continue
      if (isProbablyMetadata(a) || isProbablyMetadata(b)) continue

      // Common pattern in Holyrics exports: "Title" then "title to search" (lowercase)
      if (b === a.toLowerCase()) {
        let lyricsCandidate = ''
        for (let j = i + 2; j < Math.min(strings.length, i + 200); j++) {
          const candidate = strings[j]?.trim()
          if (!candidate || isProbablyMetadata(candidate)) continue
          if (looksLikeLyrics(candidate)) {
            lyricsCandidate = candidate
            break
          }
        }

        if (lyricsCandidate) {
          songs.push({ title: a, lyrics: lyricsCandidate })
        }
      }
    }

    // Fallback: single-song guess (biggest text chunk)
    if (songs.length === 0) {
      const candidates = strings
        .map((s) => (s ? s.trim() : ''))
        .filter((s) => s && !isProbablyMetadata(s))
        .sort((x, y) => y.length - x.length)

      const bestLyrics = candidates.find((s) => looksLikeLyrics(s)) || candidates[0] || ''
      const bestTitle =
        candidates.find((s) => s.length >= 3 && s.length <= 80 && s !== bestLyrics) || ''

      if (bestLyrics) songs.push({ title: bestTitle, lyrics: bestLyrics })
    }

    // Deduplicate by title+lyrics
    const seen = new Set()
    return songs.filter((s) => {
      const key = `${s.title}\n---\n${s.lyrics}`.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const parseHBAC = (content) => {
    const titleMatch =
      content.match(/^TITLE=(.*)$/m) ||
      content.match(/^TITULO=(.*)$/m) ||
      content.match(/^TITLE:\s*(.*)$/m) ||
      content.match(/^TITULO:\s*(.*)$/m)

    const lyricsMatch =
      content.match(/\[LYRICS\]\s*([\s\S]*)$/i) ||
      content.match(/\[LETRA\]\s*([\s\S]*)$/i) ||
      content.match(/\[LETTER\]\s*([\s\S]*)$/i)

    return {
      importedTitle: titleMatch ? titleMatch[1].trim() : '',
      importedLyrics: lyricsMatch ? lyricsMatch[1].trim() : '',
    }
  }

  const parsePPTSimulation = (content) => {
    const titleMatch = content.match(/^MUSICA:\s*(.*)$/m)
    const slideMatches = [...content.matchAll(/^CONTENT:\s*(.*)$/gm)]

    return {
      importedTitle: titleMatch ? titleMatch[1].trim() : '',
      importedLyrics: slideMatches.map((match) => match[1].trim()).filter(Boolean).join('\n'),
    }
  }

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  /** Uma linha em branco entre estrofes; linhas da mesma estrofe ficam juntas; sem linhas vazias soltas no meio. */
  const normalizeHolyricsStanzaSpacing = (text) => {
    if (!text || !text.trim()) return ''
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
    const blocks = []
    let current = []
    for (const line of lines) {
      const trimmedEnd = line.replace(/\s+$/g, '')
      if (!trimmedEnd.trim()) {
        if (current.length) {
          blocks.push(current.join('\n'))
          current = []
        }
      } else {
        current.push(trimmedEnd.trimEnd())
      }
    }
    if (current.length) blocks.push(current.join('\n'))
    return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  const isHolyricsTxtWithHeaders = (content) =>
    /^T[ií]tulo\s*:/im.test(content) || /^Artista\s*:/im.test(content)

  const parseHolyricsTxtHeaders = (content) => {
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
    let titulo = ''
    let artista = ''
    let i = 0
    while (i < lines.length) {
      const L = lines[i].trim()
      const mTit = L.match(/^T[ií]tulo\s*:\s*(.*)$/i)
      const mArt = L.match(/^Artista\s*:\s*(.*)$/i)
      if (mTit) {
        titulo = mTit[1].trim()
        i++
        continue
      }
      if (mArt) {
        artista = mArt[1].trim()
        i++
        continue
      }
      break
    }
    while (i < lines.length && !lines[i].trim()) i++
    const body = lines.slice(i).join('\n')
    return { titulo, artista, body }
  }

  const applyImportedContent = (importedTitle, importedLyrics, sourceName, extraMessage = '') => {
    const spaced = normalizeHolyricsStanzaSpacing(importedLyrics)
    setTitle(importedTitle)
    setLyrics(spaced)
    setCurrentSlide(0)
    setImportedSongs([])
    setSelectedImportedSongIndex(0)
    const lineCount = spaced ? spaced.split('\n').filter(Boolean).length : 0
    setIsFileModified(true)
    setMessage(
      `Importado: ${sourceName} • Linhas: ${lineCount}${extraMessage ? ` • ${extraMessage}` : ''}`,
    )
  }

  const processImportFile = async (file) => {
    if (!file) return

    const lowerName = file.name.toLowerCase()

    try {
      if (lowerName.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file)
        const entries = Object.keys(zip.files)
        const hbacEntry = entries.find((name) => name.toLowerCase().endsWith('.hbac'))
        const muflEntry = entries.find((name) => name.toLowerCase().endsWith('.mufl'))
        const pptEntry = entries.find(
          (name) =>
            name.toLowerCase().endsWith('.ppt') ||
            name.toLowerCase().endsWith('.pptx') ||
            name.toLowerCase().endsWith('.ppt.txt') ||
            name.toLowerCase().endsWith('.txt'),
        )

        if (muflEntry) {
          const muflBlob = await zip.file(muflEntry).async('blob')
          const muflFile = new File([muflBlob], muflEntry.split('/').pop() || 'arquivo.mufl')
          event.target.value = ''
          await handleImportProject({ target: { files: [muflFile], value: '' } })
          return
        }

        if (hbacEntry) {
          const content = await zip.file(hbacEntry).async('string')
          const { importedTitle, importedLyrics } = parseHBAC(content)
          applyImportedContent(importedTitle || title, importedLyrics || content.trim(), file.name)
        } else if (pptEntry) {
          const content = await zip.file(pptEntry).async('string')
          const looksLikeOurPpt =
            content.includes('PPT SIMULADO') ||
            /^SLIDE\s+\d+/m.test(content) ||
            /^CONTENT:\s*/m.test(content)
          if (looksLikeOurPpt) {
            const { importedTitle, importedLyrics } = parsePPTSimulation(content)
            applyImportedContent(importedTitle || title, importedLyrics || content.trim(), file.name)
          } else if (isHolyricsTxtWithHeaders(content)) {
            const { titulo, artista, body } = parseHolyricsTxtHeaders(content)
            const finalTitle = titulo || title
            applyImportedContent(
              finalTitle,
              body,
              file.name,
              artista ? `Artista: ${artista}` : 'Layout Holyrics (.txt)',
            )
          } else {
            applyImportedContent(title, content.trim(), file.name)
          }
        } else {
          setMessage('ZIP importado, mas sem arquivo de letra suportado.')
        }
      } else if (lowerName.endsWith('.hbac')) {
        const content = await readFileAsText(file)
        const { importedTitle, importedLyrics } = parseHBAC(content)
        const finalTitle = importedTitle || file.name.replace(/\.[^/.]+$/, '')
        const finalLyrics = importedLyrics || content.trim()
        applyImportedContent(finalTitle, finalLyrics, file.name)
      } else if (lowerName.endsWith('.pptx')) {
        try {
          const zip = await JSZip.loadAsync(file)
          const slideFiles = Object.keys(zip.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
          
          slideFiles.sort((a, b) => {
            const na = parseInt(a.match(/\d+/)[0])
            const nb = parseInt(b.match(/\d+/)[0])
            return na - nb
          })

          let extractedText = ''
          for (const sf of slideFiles) {
            const xml = await zip.file(sf).async('string')
            const matches = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g)
            if (matches) {
              const text = matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ')
              extractedText += text + '\n\n'
            }
          }
          
          const mediaFiles = Object.keys(zip.files).filter((k) => /^ppt\/media\/image.*\.(jpeg|jpg|png)$/i.test(k))
          let extraMessage = ''
          if (mediaFiles.length > 0) {
            const imgBlob = await zip.file(mediaFiles[0]).async('blob')
            const imgFile = new File([imgBlob], mediaFiles[0].split('/').pop(), { type: imgBlob.type })
            setImageFile(imgFile)
            setImagePreview(URL.createObjectURL(imgFile))
            extraMessage = 'Foto carregada.'
            setIsFileModified(true)
          }
          
          const finalTitle = file.name.replace(/\.pptx$/i, '')
          applyImportedContent(finalTitle, extractedText.trim(), file.name, extraMessage)
        } catch (e) {
          setMessage('Erro ao ler .pptx: Arquivo invalido ou corrompido.')
        }
      } else if (
        lowerName.endsWith('.ppt') ||
        lowerName.endsWith('.ppt.txt') ||
        lowerName.endsWith('.txt')
      ) {
        const content = await readFileAsText(file)
        const looksLikeOurPpt =
          content.includes('PPT SIMULADO') || /^SLIDE\s+\d+/m.test(content) || /^CONTENT:\s*/m.test(content)
        if (looksLikeOurPpt) {
          const { importedTitle, importedLyrics } = parsePPTSimulation(content)
          const finalTitle = importedTitle || file.name.replace(/\.[^/.]+$/, '')
          const finalLyrics = importedLyrics || content.trim()
          applyImportedContent(finalTitle, finalLyrics, file.name)
        } else if (isHolyricsTxtWithHeaders(content)) {
          const { titulo, artista, body } = parseHolyricsTxtHeaders(content)
          const finalTitle = titulo || file.name.replace(/\.[^/.]+$/, '')
          applyImportedContent(
            finalTitle,
            body,
            file.name,
            artista ? `Artista: ${artista}` : 'Layout Holyrics (.txt)',
          )
        } else {
          const finalTitle = file.name.replace(/\.[^/.]+$/, '')
          const finalLyrics = content.trim()
          applyImportedContent(finalTitle, finalLyrics, file.name)
        }
      } else if (lowerName.endsWith('.mufl')) {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)

        if (bytes[0] === 0xac && bytes[1] === 0xed) {
          const extractedStrings = extractJavaSerializedStrings(bytes)
          const songs = guessSongsFromExtractedStrings(extractedStrings)

          if (songs.length === 0) {
            setMessage('Nao foi possivel identificar a letra dentro desse MUFL.')
          } else if (songs.length === 1) {
            applyImportedContent(songs[0].title || '', songs[0].lyrics || '', file.name)
          } else {
            setImportedSongs(songs)
            setSelectedImportedSongIndex(0)
            // Auto-carrega a primeira musica para nao ficar "em branco"
            applyImportedContent(songs[0].title || '', songs[0].lyrics || '', `${file.name} (auto)`)
            setImportedSongs(songs)
            setSelectedImportedSongIndex(0)
            setMessage(`MUFL importado • ${songs.length} musicas encontradas (primeira carregada).`)
          }
        } else {
          const content = await readFileAsText(file)
          const data = JSON.parse(content)
          applyImportedContent(data.title || '', data.lyrics || '', file.name)
        }
      } else {
        setMessage('Formato nao suportado. Use MUFL, HBAC, PPT ou TXT.')
      }
    } catch {
      setMessage('Nao foi possivel importar esse arquivo.')
    }
  }

  const handleImportProject = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSelectedFileConfig({ path: null })
    setSelectedFileName(file.name)

    await processImportFile(file)
    event.target.value = ''
  }

  const handleFolderUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    if (imagePreview) URL.revokeObjectURL(imagePreview)
    if (audioPreview) URL.revokeObjectURL(audioPreview)

    setImageFile(null)
    setImagePreview('')
    setAudioFile(null)
    setAudioPreview('')
    setImportedSongs([])
    setSelectedImportedSongIndex(0)

    const folderName = extractFolderNameFromFile(files[0]) || 'Pasta importada'
    const supportedFiles = files.filter((f) =>
      /\.(mufl|hbac|ppt|pptx|txt|zip)$/i.test(f.name),
    )

    if (supportedFiles.length === 0) {
      setMessage(`A pasta enviada não continha arquivos suportados.`)
      event.target.value = ''
      return
    }

    const newRoots = buildTreeFromFiles(supportedFiles)
    const timestamp = Date.now().toString()
    const uniqueNewRoots = prefixNodeIds(newRoots, timestamp)
    
    setFolders(prev => [...prev, ...uniqueNewRoots])
    
    const firstFile = supportedFiles[0]
    setSelectedFileName(firstFile.name)
    setSelectedFileConfig({ path: `${timestamp}/${firstFile.webkitRelativePath || firstFile.name}` })
    await processImportFile(firstFile)
    
    setMessage(`Pasta importada com ${supportedFiles.length} arquivos suportados.`)
    
    event.target.value = ''
  }

  const toggleFolderExpansion = (id) => {
    setFolders(prev => toggleNodeExpansion(prev, id))
  }

  const triggerPresentationImport = (inputId) => {
    const input = document.getElementById(inputId)
    if (input) input.click()
  }

  const handleNormalizeSpacing = () => {
    const normalized = lyrics
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
    setLyrics(normalized)
    setCurrentSlide(0)
    setIsFileModified(true)
    setMessage('Espacamento da letra normalizado.')
  }

  const handleHolyricsStanzaLayout = () => {
    setLyrics(normalizeHolyricsStanzaSpacing(lyrics))
    setCurrentSlide(0)
    setIsFileModified(true)
    setMessage('Layout Holyrics: uma linha em branco entre estrofes (como no .txt de exemplo).')
  }

  const handleFindAndReplace = () => {
    if (!searchTerm.trim()) {
      setMessage('Digite um texto para localizar.')
      return
    }
    const regex = new RegExp(escapeRegExp(searchTerm), 'gi')
    const matches = lyrics.match(regex)
    const count = matches ? matches.length : 0
    setLyrics(lyrics.replace(regex, replaceTerm))
    setIsFileModified(true)
    setMessage(`Substituicoes realizadas: ${count}`)
  }

  const handleCopyLyrics = async () => {
    if (!lyrics.trim()) {
      setMessage('Nao ha letra para copiar.')
      return
    }
    try {
      await navigator.clipboard.writeText(lyrics)
      setMessage('Letra copiada para a area de transferencia.')
    } catch {
      setMessage('Falha ao copiar a letra.')
    }
  }

  const handleSaveDraft = () => {
    localStorage.setItem(
      'music-editor-draft',
      JSON.stringify({ title, lyrics, savedAt: new Date().toISOString() }),
    )
    setMessage('Rascunho salvo.')
  }

  const handleLoadDraft = () => {
    const raw = localStorage.getItem('music-editor-draft')
    if (!raw) {
      setMessage('Nenhum rascunho salvo.')
      return
    }
    try {
      const data = JSON.parse(raw)
      setTitle(data.title || '')
      setLyrics(data.lyrics || '')
      setCurrentSlide(0)
    setIsFileModified(true)
      setMessage('Rascunho carregado.')
    } catch {
      setMessage('Rascunho invalido.')
    }
  }

  const normalizeName = (value) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')

  const formatDate = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const second = String(now.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  const getCleanLyrics = (content) => {
    const seen = new Set()

    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .filter((line) => {
        const key = line.toLowerCase()
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
      .join('\n')
  }

  const handleAutoEdit = () => {
    const cleanedLyrics = getCleanLyrics(lyrics)
    setLyrics(cleanedLyrics)
    setCurrentSlide(0)
    setMessage('Letra ajustada automaticamente com duplicacoes removidas.')
  }

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setIsFileModified(true)
    setMessage(`Imagem carregada: ${file.name}`)
  }

  const handleAudioUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setAudioFile(file)
    setAudioPreview(URL.createObjectURL(file))
    setIsFileModified(true)
    setMessage(`Audio carregado: ${file.name}`)
  }

  const handleDonationQrUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setDonationQrFile(file)
    setDonationQrPreview(URL.createObjectURL(file))
    setIsFileModified(true)
    setMessage(`QR Code Doação carregado: ${file.name}`)
  }

  const handleFaviconUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFaviconFile(file)
    const url = URL.createObjectURL(file)
    setFaviconPreview(url)
    
    // Altera o favicon da aba
    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = url
    setIsFileModified(true)
    setMessage(`Favicon carregado: ${file.name}`)
  }

  const handleClear = () => {
    if (autoSlideTimerId) {
      clearInterval(autoSlideTimerId)
      setAutoSlideTimerId(null)
      setIsPresenting(false)
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    if (audioPreview) URL.revokeObjectURL(audioPreview)
    if (donationQrPreview) URL.revokeObjectURL(donationQrPreview)

    setTitle('')
    setLyrics('')
    setCurrentSlide(0)
    setImportedSongs([])
    setSelectedImportedSongIndex(0)
    setFolders([])
    setSelectedFileConfig({ folderId: null, fileIdx: null })
    setSelectedFileName('Nenhum arquivo')
    setIsFileModified(false)
    setImageFile(null)
    setImagePreview('')
    setAudioFile(null)
    setAudioPreview('')
    setDonationQrFile(null)
    setDonationQrPreview('')
    setMessage('Editor limpo com sucesso.')
  }

  const generateHBAC = (cleanedLyrics, exportedAt) => {
    return [
      '[HBAC]',
      `TITLE=${title}`,
      `DATE=${exportedAt}`,
      `LYRICS_LINES=${cleanedLyrics.split('\n').length}`,
      `HAS_IMAGE=${imageFile ? 'YES' : 'NO'}`,
      `HAS_AUDIO=${audioFile ? 'YES' : 'NO'}`,
      '',
      '[LYRICS]',
      cleanedLyrics,
    ].join('\n')
  }

  const generatePPTSimulation = (cleanedLyrics, exportedAt) => {
    const slides = cleanedLyrics
      .split('\n')
      .filter(Boolean)
      .map(
        (line, index) =>
          `SLIDE ${index + 1}\nTITLE: ${title}\nCONTENT: ${line}\nMEDIA_IMAGE: ${
            imageFile ? imageFile.name : 'NONE'
          }\nMEDIA_AUDIO: ${audioFile ? audioFile.name : 'NONE'}\n`,
      )
      .join('\n')

    return [
      'PPT SIMULADO',
      `MUSICA: ${title}`,
      `EXPORTADO_EM: ${exportedAt}`,
      '',
      slides || 'SLIDE 1\nCONTENT: Sem conteudo disponivel.\n',
    ].join('\n')
  }

  const handleExportZip = async () => {
    if (!title.trim() || !lyrics.trim()) {
      setMessage('Preencha o titulo e a letra antes de exportar.')
      return
    }

    if (imageFile) {
      const confirmImage = window.confirm(`Você selecionou uma foto (${imageFile.name}). Deseja aplicá-la na apresentação?`)
      if (!confirmImage) {
        setMessage('Ação cancelada.')
        return
      }
    }

    try {
      setIsExporting(true)
      const cleanedLyrics = getCleanLyrics(lyrics)
      const exportedAt = formatDate()
      const safeName = normalizeName(title) || 'musica'
      const zip = new JSZip()

      const muflData = {
        title: title.trim(),
        lyrics: cleanedLyrics,
        date: exportedAt,
        image: imageFile ? imageFile.name : null,
        audio: audioFile ? audioFile.name : null,
      }

      zip.file(`${safeName}.MUFL`, JSON.stringify(muflData, null, 2))
      zip.file(`${safeName}.HBAC`, generateHBAC(cleanedLyrics, exportedAt))
      zip.file(`${safeName}.PPT.txt`, generatePPTSimulation(cleanedLyrics, exportedAt))

      if (imageFile) {
        zip.file(`media/imagem-${imageFile.name}`, imageFile)
      }

      if (audioFile) {
        zip.file(`media/audio-${audioFile.name}`, audioFile)
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `${safeName}.zip`)
      setLyrics(cleanedLyrics)
      setIsFileModified(false)
      setMessage('Pacote ZIP gerado e baixado com sucesso.')
    } catch {
      setMessage('Nao foi possivel gerar o ZIP.')
    } finally {
      setIsExporting(false)
    }
  }

  const downloadTextFile = (name, content) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, name)
  }

  const handleExportSingle = (kind) => {
    if (!title.trim() || !lyrics.trim()) {
      setMessage('Preencha titulo e letra para exportar.')
      return
    }
    const cleanedLyrics = getCleanLyrics(lyrics)
    const exportedAt = formatDate()
    const safeName = normalizeName(title) || 'musica'

    if (kind === 'mufl') {
      downloadTextFile(
        `${safeName}.MUFL`,
        JSON.stringify(
          {
            title: title.trim(),
            lyrics: cleanedLyrics,
            date: exportedAt,
            image: imageFile ? imageFile.name : null,
            audio: audioFile ? audioFile.name : null,
          },
          null,
          2,
        ),
      )
    } else if (kind === 'hbac') {
      downloadTextFile(`${safeName}.HBAC`, generateHBAC(cleanedLyrics, exportedAt))
    } else if (kind === 'ppt') {
      if (imageFile) {
        const confirmImage = window.confirm(`Você selecionou uma foto (${imageFile.name}). Deseja aplicá-la no PowerPoint?`)
        if (!confirmImage) {
          setMessage('Ação cancelada.')
          return
        }
      }
      downloadTextFile(`${safeName}.PPT.txt`, generatePPTSimulation(cleanedLyrics, exportedAt))
    }
    setIsFileModified(false)
    setMessage(`Arquivo ${kind.toUpperCase()} exportado.`)
  }

  const cardStyle = {
    width: '100%',
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: 24,
    boxShadow: '0 24px 80px rgba(15, 23, 42, 0.45)',
    backdropFilter: 'blur(14px)',
  }

  const labelStyle = {
    display: 'block',
    marginBottom: 8,
    fontSize: 14,
    fontWeight: 600,
    color: '#cbd5e1',
  }

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(15, 23, 42, 0.95)',
    color: '#f8fafc',
    outline: 'none',
  }

  const buttonStyle = {
    padding: '14px 18px',
    borderRadius: 14,
    border: 'none',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'transform 0.2s ease, opacity 0.2s ease',
  }

  const slides = lyrics
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const totalSlides = slides.length
  const activeSlide = slides[currentSlide] || 'Sua letra aparecera aqui em formato de apresentacao.'
  const wordsCount = lyrics.trim() ? lyrics.trim().split(/\s+/).length : 0
  const linesCount = lyrics.trim() ? lyrics.split('\n').filter((l) => l.trim()).length : 0
  const duplicatesCount = (() => {
    const normalized = lyrics
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean)
    const unique = new Set(normalized)
    return Math.max(0, normalized.length - unique.size)
  })()

  const goToPreviousSlide = () => {
    if (totalSlides === 0) return
    setCurrentSlide((prev) => (prev === 0 ? totalSlides - 1 : prev - 1))
  }

  const goToNextSlide = () => {
    if (totalSlides === 0) return
    setCurrentSlide((prev) => (prev === totalSlides - 1 ? 0 : prev + 1))
  }

  const handleTitleChange = (event) => {
    setTitle(event.target.value)
    setIsFileModified(true)
  }

  const handleLyricsChange = (event) => {
    setLyrics(event.target.value)
    setIsFileModified(true)
  }

  const handleApiKeyChange = (e) => {
    const val = e.target.value
    setApiKey(val)
    localStorage.setItem(`${aiProvider}_api_key`, val)
  }

  const handleAiProviderChange = (e) => {
    const newProvider = e.target.value
    setAiProvider(newProvider)
    localStorage.setItem('ai_provider', newProvider)
    setApiKey(localStorage.getItem(`${newProvider}_api_key`) || '')
  }

  const handleBatchAiEdit = async () => {
    if (!apiKey) {
      setMessage('Atenção: Configure a Chave da API na área de configurações primeiro.')
      return
    }
    const files = getAllFileNodes(folders)
    if (files.length === 0) {
      setMessage('Nenhum arquivo para processar. Importe uma pasta primeiro.')
      return
    }

    setIsExporting(true)
    let processedCount = 0

    for (let node of files) {
      setMessage(`Otimizando IA (${processedCount + 1}/${files.length}): ${node.name}...`)
      try {
        let rawText = ''
        if (node.name.toLowerCase().endsWith('.hbac') || node.name.toLowerCase().endsWith('.txt')) {
           rawText = await node.file.text()
           const linesMatch = rawText.match(/\[LYRICS\]\s*([\s\S]*)$/i) || rawText.match(/\[LETRA\]\s*([\s\S]*)$/i)
           if (linesMatch) rawText = linesMatch[1].trim()
        } else {
           rawText = await node.file.text()
        }
        
        if (rawText && rawText.trim().length > 10) {
          const optimized = await runAiOptimization(rawText, apiKey, aiProvider)
          setFolders(prev => updateNodeContent(prev, node.id, { optimizedContent: optimized, isOptimized: true }))
        }
      } catch (e) {}
      processedCount++
    }

    setIsExporting(false)
    setMessage(`Lote IA concluido! ${processedCount} arquivo(s) otimizados na memória via ${aiProvider.toUpperCase()}.`)
  }

  const handleExportBatchZip = async () => {
    const files = getAllFileNodes(folders)
    if (files.length === 0) {
      setMessage('Nenhuma pasta/arquivos para unificar em ZIP.')
      return
    }

    setIsExporting(true)
    setMessage('Gerando arquivo ZIP em Lote (Batch)...')
    try {
      const zip = new JSZip()
      const exportedAt = formatDate()
      
      for (let node of files) {
        let rawText = ''
        try { rawText = await node.file.text() } catch(e){}
        const finalLyrics = node.optimizedContent || rawText
        const finalTitle = node.name.replace(/\.[^/.]+$/, '')
        const safeName = normalizeName(finalTitle) || 'musica'

        const pathParts = node.path.split('/')
        pathParts.pop() // remove o nome do arquivo, deixa apenas o caminho da pasta raiz/nativa
        const folderZip = pathParts.length > 0 ? zip.folder(pathParts.join('/')) : zip
        
        folderZip.file(`${safeName}.HBAC`, generateHBACForBatch(finalTitle, finalLyrics, exportedAt))
      }
      
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `Otimizacao_Lote_${Date.now()}.zip`)
      setMessage('Pacote Lote ZIP gerado e salvo.')
    } catch {
      setMessage('Erro ao gerar Lote ZIP.')
    }
    setIsExporting(false)
  }

  const handleRunSelectedAction = () => {
    if (selectedAction === 'audio-upload') {
      const audioInput = document.getElementById('audio-upload')
      if (audioInput) audioInput.click()
      return
    }
    if (selectedAction === 'auto-edit') return handleAutoEdit()
    if (selectedAction === 'batch-ai-edit') return handleBatchAiEdit()
    if (selectedAction === 'export-batch-zip') return handleExportBatchZip()
    if (selectedAction === 'normalize-spacing') return handleNormalizeSpacing()
    if (selectedAction === 'holyrics-layout') return handleHolyricsStanzaLayout()
    if (selectedAction === 'copy-lyrics') return handleCopyLyrics()
    if (selectedAction === 'save-draft') return handleSaveDraft()
    if (selectedAction === 'load-draft') return handleLoadDraft()
    if (selectedAction === 'clear') return handleClear()
    if (selectedAction === 'export-zip') return handleExportZip()
    if (selectedAction === 'export-mufl') return handleExportSingle('mufl')
    if (selectedAction === 'export-hbac') return handleExportSingle('hbac')
    if (selectedAction === 'export-ppt') return handleExportSingle('ppt')
  }

  const stopAutoPresentation = () => {
    if (autoSlideTimerId) {
      clearInterval(autoSlideTimerId)
      setAutoSlideTimerId(null)
    }
    setIsPresenting(false)
  }

  const startAutoPresentation = () => {
    if (totalSlides === 0) {
      setMessage('Adicione uma letra para iniciar a apresentacao.')
      return
    }
    if (autoSlideTimerId) clearInterval(autoSlideTimerId)
    const seconds = Math.max(1, Number(autoSlideSeconds) || 4)
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev === totalSlides - 1 ? 0 : prev + 1))
    }, seconds * 1000)
    setAutoSlideTimerId(timer)
    setIsPresenting(true)
    setMessage(`Apresentacao automatica iniciada (${seconds}s por slide).`)
  }

  const toggleAutoPresentation = () => {
    if (isPresenting) {
      stopAutoPresentation()
      setMessage('Apresentacao automatica pausada.')
    } else {
      startAutoPresentation()
    }
  }

  const handleFullscreenPresentation = async () => {
    const surface = document.getElementById('presentation-surface')
    if (!surface) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await surface.requestFullscreen()
      }
    } catch {
      setMessage('Nao foi possivel alternar tela cheia.')
    }
  }

  const handlePresentationKeyDown = (event) => {
    if (event.key === 'ArrowRight') goToNextSlide()
    if (event.key === 'ArrowLeft') goToPreviousSlide()
    if (event.key === ' ') {
      event.preventDefault()
      goToNextSlide()
    }
    if (event.key.toLowerCase() === 'f') {
      handleFullscreenPresentation()
    }
  }

  const renderTreeNode = (node, depth = 0) => {
    const isFolder = node.type === 'folder'
    const isSelected = !isFolder && selectedFileConfig.path === node.id

    return (
      <div key={node.id}>
        <div
          onClick={() => {
            if (isFolder) {
              toggleFolderExpansion(node.id)
            } else {
              setSelectedFileConfig({ path: node.id })
              setSelectedFileName(node.name)
              processImportFile(node.file)
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: `6px 12px 6px ${12 + depth * 16}px`,
            cursor: 'pointer',
            userSelect: 'none',
            color: isSelected ? '#38bdf8' : (isFolder ? '#e2e8f0' : '#94a3b8'),
            background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            transition: 'background 0.2s',
            fontSize: 13,
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              if (!isFolder) e.currentTarget.style.color = '#cbd5e1'
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.background = 'transparent'
              if (!isFolder) e.currentTarget.style.color = '#94a3b8'
            }
          }}
        >
          {/* Guide lines for indent styled like VS Code */}
          {[...Array(depth)].map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: 18 + i * 16, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.05)' }} />
          ))}
          
          {isFolder && (
            <span style={{ 
              transform: node.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
              transition: 'transform 0.1s', 
              fontSize: 10, 
              display: 'inline-block',
              width: 12,
              textAlign: 'center'
            }}>
              ▶
            </span>
          )}
          
          {isFolder ? (
            <>
              <span style={{ fontSize: 13, marginRight: 4 }}>
                 {node.isExpanded ? '📂' : '📁'}
              </span>
              <span style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {node.name}
              </span>
            </>
          ) : (
            <>
              {/* Ícone de arquivo */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: isSelected ? 1 : 0.6, flexShrink: 0, marginRight: 4, marginLeft: isFolder ? 0 : 16 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {node.name}
              </span>
              {node.isOptimized && <span title="Otimizado por IA" style={{ marginLeft: 6, fontSize: 13 }}>✨</span>}
            </>
          )}
        </div>
        
        {isFolder && node.isExpanded && node.children && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {node.children.map((childNode) => renderTreeNode(childNode, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="responsive-padding"
        style={{
          width: '100%',
          maxWidth: 1100,
          ...cardStyle,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="info-grid">
          <div style={{ ...inputStyle, padding: '10px 12px', textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
            Pasta: {folders.length > 0 ? folders[folders.length - 1].name : 'Sem pasta'}
          </div>
          <div style={{ ...inputStyle, padding: '10px 12px', textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
            Hora: {formatTimeOnly(currentDateTime)}
          </div>
          <div style={{ ...inputStyle, padding: '10px 12px', textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
            Data: {formatDateOnly(currentDateTime)}
          </div>
        </div>

        <div
          style={{
            ...cardStyle,
            padding: 14,
            marginBottom: 18,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ color: '#bfdbfe', fontWeight: 800 }}>
            {title.trim() ? `Carregado: ${title.trim()}` : 'Nenhuma musica carregada'}
          </div>
          <div style={{ color: message ? '#bfdbfe' : '#64748b', fontWeight: 700 }}>
            {message || 'Importe um arquivo para começar.'}
          </div>
        </div>

        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.6,
            }}
          >
            HOLYRICS SIMPLIFICADO
          </div>
          <h1 style={{ margin: '16px 0 8px', fontSize: 36, color: '#f8fafc' }}>
            Editor de Musica
          </h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 16 }}>
            Edite letras, remova repeticoes e exporte tudo em um unico pacote ZIP.
          </p>
          <div style={{ margin: '14px auto 0', maxWidth: 420, textAlign: 'left' }}>
            <input
              id="audio-upload"
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>


              {audioPreview && (
                <div style={{ marginTop: 4 }}>
                  <audio src={audioPreview} controls style={{ width: '100%', height: 38 }} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="main-grid"
          style={{
            order: 3,
          }}
        >
          <div style={{ ...cardStyle, padding: 20 }}>
            <div
              style={{
                ...inputStyle,
                marginBottom: 20,
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 8,
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
              }}
            >
              <div style={{ fontSize: 15, color: '#f8fafc', fontWeight: 600 }}>
                Arquivo selecionado: {selectedFileName}
              </div>
              <div style={{ 
                color: isFileModified ? '#fbbf24' : '#86efac', 
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 4
              }}>
                <span style={{ 
                  width: 10, 
                  height: 10, 
                  borderRadius: '50%', 
                  background: isFileModified ? '#fbbf24' : '#86efac',
                  boxShadow: isFileModified ? '0 0 10px #fbbf24' : '0 0 10px #86efac'
                }}></span>
                {isFileModified ? 'Arquivo modificado' : 'Arquivo salvo/baixado'}
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label htmlFor="title" style={labelStyle}>
                  Titulo da musica
                </label>
                <input
                  id="title"
                  type="text"
                  placeholder="Digite o titulo"
                  value={title}
                  onChange={handleTitleChange}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Localizar e substituir</label>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <input
                    type="text"
                    placeholder="Localizar"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ ...inputStyle, padding: 12, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleFindAndReplace}
                    style={{
                      ...buttonStyle,
                      width: 46,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(148, 163, 184, 0.18)',
                      color: '#94a3b8',
                      transition: 'all 0.2s',
                    }}
                    title="Aplicar Substituicao"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(245, 158, 11, 0.15)';
                      e.currentTarget.style.color = '#f59e0b';
                      e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(15, 23, 42, 0.4)';
                      e.currentTarget.style.color = '#94a3b8';
                      e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.18)';
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Substituir por"
                  value={replaceTerm}
                  onChange={(e) => setReplaceTerm(e.target.value)}
                  style={{ ...inputStyle, padding: 12, width: '100%' }}
                />
              </div>
            </div>

            <div className="editor-sidebar-grid">
              {/* Coluna da Letra */}
              <div>
                <label htmlFor="lyrics" style={labelStyle}>
                  Letra
                </label>
                <textarea
                  id="lyrics"
                  placeholder="Digite ou cole a letra aqui..."
                  value={lyrics}
                  onChange={handleLyricsChange}
                  style={{
                    ...inputStyle,
                    minHeight: 450,
                    resize: 'vertical',
                    lineHeight: 1.6,
                  }}
                />
                <div className="stats-grid">
                  <div style={{ ...inputStyle, padding: '10px 12px', textAlign: 'center' }}>
                    Linhas: {linesCount}
                  </div>
                  <div style={{ ...inputStyle, padding: '10px 12px', textAlign: 'center' }}>
                    Palavras: {wordsCount}
                  </div>
                  <div style={{ ...inputStyle, padding: '10px 12px', textAlign: 'center' }}>
                    Duplicadas: {duplicatesCount}
                  </div>
                </div>
              </div>

              {/* Coluna lateral de Pastas (Estilo VS Code) */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingRight: 4 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Arquivos</label>
                  <label
                    htmlFor="project-folder-import"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 16,
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                    }}
                    title="Adicionar pasta"
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
                  >
                    +
                  </label>
                </div>

                <div
                  style={{
                    ...inputStyle,
                    flex: 1,
                    padding: '8px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    minHeight: 504,
                  }}
                >
                  {folders.map((folderNode) => renderTreeNode(folderNode))}
                  {folders.length === 0 && (
                    <div style={{ padding: '6px 12px 6px 36px', fontSize: 13, color: '#64748b' }}>
                      Vazio
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            <div style={{ ...cardStyle, padding: 20 }}>
              <label htmlFor="project-import" style={labelStyle}>
                Abrir arquivo para editar
              </label>
              <input
                id="project-import"
                type="file"
                accept=".mufl,.hbac,.ppt,.pptx,.txt,.zip"
                onChange={handleImportProject}
                style={{ display: 'none' }}
              />
              <input
                id="project-folder-import"
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderUpload}
                style={{ display: 'none' }}
              />
              <div
                style={{
                  ...inputStyle,
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <label
                  htmlFor="project-import"
                  style={{
                    ...buttonStyle,
                    display: 'inline-block',
                    padding: '10px 14px',
                    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                    color: '#fff',
                  }}
                >
                  Arquivo
                </label>
                <label
                  htmlFor="project-folder-import"
                  style={{
                    ...buttonStyle,
                    display: 'inline-block',
                    padding: '10px 14px',
                    background: 'linear-gradient(135deg, #6366f1, #4338ca)',
                    color: '#fff',
                  }}
                >
                  Pasta
                </label>
                <span style={{ color: '#cbd5e1', fontSize: 13 }}>
                  {selectedFileName}
                  {folders.length > 0 ? ` • ${folders[folders.length - 1].name}` : ''}
                </span>
              </div>




              {importedSongs.length > 1 ? (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>
                    Musicas encontradas no MUFL ({importedSongs.length})
                  </label>
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      borderRadius: 14,
                      border: '1px solid rgba(148, 163, 184, 0.18)',
                      background: 'rgba(15, 23, 42, 0.4)',
                    }}
                  >
                    {importedSongs.map((s, idx) => (
                      <div
                        key={`${s.title}-${idx}`}
                        onClick={() => {
                          setSelectedImportedSongIndex(idx)
                          applyImportedContent(s.title || '', s.lyrics || '', 'MUFL (pack)')
                        }}
                        style={{
                          padding: '12px 14px',
                          cursor: 'pointer',
                          background: selectedImportedSongIndex === idx ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                          color: selectedImportedSongIndex === idx ? '#86efac' : '#cbd5e1',
                          borderBottom: '1px solid rgba(148, 163, 184, 0.05)',
                          fontSize: 13,
                          fontWeight: selectedImportedSongIndex === idx ? 700 : 400,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {s.title || `Musica ${idx + 1}`}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', marginBottom: 16 }}>
                <label
                  htmlFor="image-presentation"
                  style={{
                    ...buttonStyle,
                    display: 'inline-block',
                    background: 'linear-gradient(135deg, #38bdf8, #2563eb)',
                    color: '#fff',
                    flex: '0 0 auto',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Escolher foto
                </label>
                <span style={{ color: '#cbd5e1', fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                  {imageFile ? imageFile.name : 'Nenhuma foto selecionada'}
                </span>
                <input
                  id="image-presentation"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
              </div>

              <label style={labelStyle}>Preview da imagem</label>
              {imagePreview ? (
                <div style={{ marginTop: 16 }}>
                  <img
                    src={imagePreview}
                    alt="Preview da imagem"
                    style={{
                      width: '100%',
                      borderRadius: 18,
                      maxHeight: 220,
                      objectFit: 'cover',
                      border: '1px solid rgba(148, 163, 184, 0.18)',
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 16,
                    padding: 20,
                    borderRadius: 18,
                    border: '1px dashed rgba(148, 163, 184, 0.25)',
                    textAlign: 'center',
                    color: '#64748b',
                  }}
                >
                  Nenhuma imagem carregada
                </div>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', marginTop: 16 }}>
                <label
                  htmlFor="favicon-upload"
                  style={{
                    ...buttonStyle,
                    display: 'inline-block',
                    background: 'linear-gradient(135deg, #38bdf8, #2563eb)',
                    color: '#fff',
                    flex: '0 0 auto',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Subir Favicon
                </label>
                <span style={{ color: '#cbd5e1', fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                  {faviconFile ? faviconFile.name : 'Nenhum favicon'}
                </span>
                <input
                  id="favicon-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFaviconUpload}
                  style={{ display: 'none' }}
                />
              </div>
              
              <div style={{ marginTop: 24, padding: 16, background: 'rgba(15, 23, 42, 0.4)', borderRadius: 16, border: '1px solid rgba(148, 163, 184, 0.12)' }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
                  Configuração de Inteligência Artificial
                </label>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.4 }}>
                  Escolha seu provedor e insira sua respectiva chave de API segura para otimizações em lote.
                </div>
                
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <select
                    value={aiProvider}
                    onChange={handleAiProviderChange}
                    style={{ ...inputStyle, flex: '1 1 140px', fontSize: 13, padding: '10px', background: 'rgba(0,0,0,0.2)' }}
                  >
                    <option value="openai">OpenAI (ChatGPT)</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="anthropic">Anthropic Claude</option>
                  </select>
                  
                  <input
                    type="password"
                    placeholder={`Chave de API ${aiProvider.toUpperCase()}...`}
                    value={apiKey}
                    onChange={handleApiKeyChange}
                    style={{ ...inputStyle, flex: '2 1 200px', fontSize: 13, padding: '10px 14px', background: 'rgba(0,0,0,0.2)' }}
                  />
                </div>
              </div>

              {/* QR Code Utility Starter */}
              <div style={{ marginTop: 16, padding: 16, background: 'rgba(15, 23, 42, 0.4)', borderRadius: 16, border: '1px solid rgba(148, 163, 184, 0.12)' }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>
                  Utilitários de QR Code
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                    <label
                      htmlFor="donation-qr-upload"
                      style={{
                        ...buttonStyle,
                        display: 'block',
                        background: 'linear-gradient(135deg, #10b981, #047857)',
                        color: '#fff',
                        fontSize: 13,
                        textAlign: 'center',
                        width: '100%',
                      }}
                    >
                      Subir QR de Doação
                    </label>

                    {donationQrPreview && donationQrFile ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <img 
                          src={donationQrPreview} 
                          alt="QR Code Preview" 
                          style={{ width: 100, height: 100, objectFit: 'contain', borderRadius: 6, background: '#fff', padding: 4 }} 
                        />
                        <span style={{ color: '#cbd5e1', fontSize: 12, textAlign: 'center', wordBreak: 'break-all', maxWidth: '100%', lineHeight: 1.3 }}>
                          Doações
                        </span>
                      </div>
                    ) : (
                       <div style={{ textAlign: 'center', marginTop: 2 }}>
                         <span style={{ color: '#64748b', fontSize: 13 }}>Nenhum QR selecionado</span>
                       </div>
                    )}

                    <input
                      id="donation-qr-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleDonationQrUpload}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 20 }}>
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: '1fr',
                }}
              >
                <label style={labelStyle}>Acoes rapidas (escolha)</label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  style={{ ...inputStyle, padding: 12 }}
                >
                  <option value="auto-edit">Auto Editar</option>
                  <option value="batch-ai-edit">✨ Otimizar Pasta com IA (Lote)</option>
                  <option value="export-batch-zip">Gerar ZIP Múltiplo (Lote)</option>
                  <option value="normalize-spacing">Normalizar Espacos</option>
                  <option value="holyrics-layout">Layout Holyrics (estrofes)</option>
                  <option value="copy-lyrics">Copiar Letra</option>
                  <option value="save-draft">Salvar Rascunho</option>
                  <option value="load-draft">Carregar Rascunho</option>
                  <option value="audio-upload">Upload de Audio</option>
                  <option value="export-zip">Gerar ZIP</option>
                  <option value="export-mufl">Exportar MUFL</option>
                  <option value="export-hbac">Exportar HBAC</option>
                  <option value="export-ppt">Exportar PPT</option>
                  <option value="clear">Limpar</option>
                </select>
                <button
                  type="button"
                  onClick={handleRunSelectedAction}
                  disabled={isExporting}
                  style={{
                    ...buttonStyle,
                    background: isExporting
                      ? 'rgba(34, 197, 94, 0.35)'
                      : 'linear-gradient(135deg, #22c55e, #15803d)',
                    color: '#fff',
                    opacity: isExporting ? 0.75 : 1,
                  }}
                >
                  {isExporting ? 'Processando...' : 'Executar acao'}
                </button>
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: '14px 16px',
                  borderRadius: 16,
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.16)',
                  color: message ? '#bfdbfe' : '#64748b',
                  minHeight: 52,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {message || 'Pronto para editar, carregar midias e exportar.'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 20, padding: 20, order: 2 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: '#f8fafc', fontSize: 24 }}>Modo Apresentacao</h2>
              <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
                A letra aparece como slides, estilo PowerPoint.
              </p>
            </div>
            <div
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(59, 130, 246, 0.14)',
                color: '#bfdbfe',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {totalSlides > 0 ? `Slide ${currentSlide + 1} de ${totalSlides}` : 'Sem slides'}
            </div>
          </div>

          <div
            style={{
              marginBottom: 12,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={toggleAutoPresentation}
              style={{
                ...buttonStyle,
                padding: '10px 14px',
                background: isPresenting
                  ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                  : 'linear-gradient(135deg, #22c55e, #15803d)',
                color: '#fff',
              }}
            >
              {isPresenting ? 'Pausar Apresentacao' : 'Iniciar Apresentacao'}
            </button>
            <button
              type="button"
              onClick={handleFullscreenPresentation}
              style={{
                ...buttonStyle,
                padding: '10px 14px',
                background: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
                color: '#fff',
              }}
            >
              Tela Cheia
            </button>
            <label style={{ color: '#cbd5e1', fontWeight: 700 }}>Tempo (s)</label>
            <input
              type="number"
              min="1"
              max="30"
              value={autoSlideSeconds}
              onChange={(e) => setAutoSlideSeconds(Number(e.target.value))}
              style={{ ...inputStyle, width: 88, padding: '10px 8px' }}
            />
          </div>

          <div
            id="presentation-surface"
            tabIndex={0}
            onKeyDown={handlePresentationKeyDown}
            onDoubleClick={handleFullscreenPresentation}
            title="Setas: navegar | Espaco: proximo | F: tela cheia"
            style={{
              position: 'relative',
              minHeight: 420,
              borderRadius: 28,
              overflow: 'hidden',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              background: imagePreview
                ? `linear-gradient(rgba(2, 6, 23, 0.45), rgba(2, 6, 23, 0.72)), url(${imagePreview}) center/cover`
                : 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 50%, #020617 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
            }}
          >
            {donationQrPreview && (
              <img 
                src={donationQrPreview} 
                alt="QR Code de Doação" 
                style={{ 
                  position: 'absolute', 
                  bottom: 24, 
                  right: 24, 
                  width: 140, 
                  height: 140, 
                  borderRadius: 12, 
                  border: '4px solid #fff', 
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)', 
                  zIndex: 10 
                }} 
              />
            )}
            
            <div
              style={{
                maxWidth: 760,
                textAlign: 'center',
                color: '#ffffff',
                textShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
              }}
            >
              <div
                style={{
                  marginBottom: 18,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  color: 'rgba(255, 255, 255, 0.78)',
                }}
              >
                {title.trim() || 'TITULO DA MUSICA'}
              </div>
              <div
                style={{
                  fontSize: totalSlides > 0 ? slideFontSize : 28,
                  lineHeight: 1.35,
                  fontWeight: 800,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {activeSlide}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: '#cbd5e1', fontWeight: 700 }}>Fonte do slide</span>
            <input
              type="range"
              min="24"
              max="72"
              value={slideFontSize}
              onChange={(e) => setSlideFontSize(Number(e.target.value))}
              style={{ width: 220 }}
            />
            <span style={{ color: '#e2e8f0', minWidth: 34 }}>{slideFontSize}</span>
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={goToPreviousSlide}
              style={{
                ...buttonStyle,
                background: 'rgba(148, 163, 184, 0.16)',
                color: '#e2e8f0',
                minWidth: 140,
              }}
            >
              Slide Anterior
            </button>
            <button
              type="button"
              onClick={goToNextSlide}
              style={{
                ...buttonStyle,
                background: 'linear-gradient(135deg, #8b5cf6, #2563eb)',
                color: '#fff',
                minWidth: 140,
              }}
            >
              Proximo Slide
            </button>
          </div>

          <div
            style={{
              marginTop: 12,
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <input
              id="presentation-import-mufl"
              type="file"
              accept=".mufl"
              onChange={handleImportProject}
              style={{ display: 'none' }}
            />
            <input
              id="presentation-import-hbac"
              type="file"
              accept=".hbac"
              onChange={handleImportProject}
              style={{ display: 'none' }}
            />
            <input
              id="presentation-import-ppt"
              type="file"
              accept=".ppt,.pptx,.ppt.txt,.txt"
              onChange={handleImportProject}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => triggerPresentationImport('presentation-import-mufl')}
              style={{ ...buttonStyle, padding: '10px 12px', background: '#334155', color: '#fff' }}
            >
              MUFL
            </button>
            <button
              type="button"
              onClick={() => triggerPresentationImport('presentation-import-hbac')}
              style={{ ...buttonStyle, padding: '10px 12px', background: '#334155', color: '#fff' }}
            >
              HBAC
            </button>
            <button
               type="button"
               onClick={() => triggerPresentationImport('presentation-import-ppt')}
               style={{ ...buttonStyle, padding: '10px 12px', background: '#334155', color: '#fff' }}
             >
               PPT
             </button>
           </div>
 
         </div>
       </div>

      {showQrModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
        }}>
          <div style={{ ...cardStyle, width: '100%', maxWidth: 500, padding: 32, position: 'relative' }}>
            <button
               onClick={() => setShowQrModal(false)}
               style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}
            >
              ✕
            </button>
            <h2 style={{ margin: '0 0 24px', color: '#f8fafc', display: 'flex', gap: 10, alignItems: 'center', fontSize: 20 }}>
               Estação QR Code
            </h2>
            
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
               <button 
                 onClick={() => setQrMode('generate')}
                 style={{ ...buttonStyle, padding: '10px', flex: 1, background: qrMode === 'generate' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', color: qrMode === 'generate' ? '#38bdf8' : '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)' }}
               >
                 Gerar
               </button>
               <button 
                 onClick={() => { setQrMode('scan'); setScanResult(''); setScanError(''); }}
                 style={{ ...buttonStyle, padding: '10px', flex: 1, background: qrMode === 'scan' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', color: qrMode === 'scan' ? '#38bdf8' : '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)' }}
               >
                 Acessar Câmera
               </button>
            </div>

            {qrMode === 'generate' && (
               <div>
                 <label style={labelStyle}>O que o QR Code exibirá?</label>
                 <input 
                   value={qrText} 
                   onChange={(e) => setQrText(e.target.value)} 
                   placeholder="Link (ex: igrejax.com) ou texto..." 
                   style={{ ...inputStyle, marginBottom: 20, padding: 12 }} 
                 />
                 <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: 24, borderRadius: 16 }}>
                   {qrText.trim() ? <QRCodeSVG value={qrText} size={200} /> : <div style={{height: 200, display: 'flex', alignItems: 'center', color: '#94a3b8'}}>Comece a digitar...</div>}
                 </div>
               </div>
            )}

            {qrMode === 'scan' && (
               <div>
                 <div style={{ overflow: 'hidden', borderRadius: 16, background: '#000', marginBottom: 16 }}>
                    <video ref={videoRef} style={{ width: '100%', height: 240, objectFit: 'cover' }} />
                 </div>
                 {scanError && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{scanError}</div>}
                 <div style={{ padding: 16, background: 'rgba(56, 189, 248, 0.1)', borderRadius: 12, border: '1px solid rgba(56, 189, 248, 0.2)', minHeight: 60 }}>
                    <div style={{ fontSize: 12, color: '#38bdf8', marginBottom: 4, fontWeight: 700 }}>Foi lido o texto:</div>
                    <div style={{ color: '#fff', fontSize: 14, wordBreak: 'break-all' }}>{scanResult || 'Apontar para um QR Code...'}</div>
                 </div>
               </div>
            )}
          </div>
        </div>
      )}

     </div>
   )
 }

export default App
