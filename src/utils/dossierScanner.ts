export type ParsedClient = {
  clientLastName: string;
  clientFirstName: string;
};

export type ParsedDossierPath = ParsedClient & {
  projectName: string;
  pieceName: string;
};

const splitSegments = (p: string) =>
  String(p || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

const stripExt = (filename: string) => {
  const name = String(filename || '');
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
};

const cleanSegment = (value: string) =>
  String(value || '')
    .replace(/[_]+/g, ' ')
    .replace(/[-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const parseClientSegment = (segment: string): ParsedClient => {
  const raw = cleanSegment(segment);
  if (!raw) return { clientLastName: '', clientFirstName: '' };

  // Supported: "Last, First" or "Last First"
  if (raw.includes(',')) {
    const [last, first] = raw.split(',').map((s) => s.trim());
    return { clientLastName: last || '', clientFirstName: first || '' };
  }

  const parts = raw.split(' ').filter(Boolean);
  if (parts.length === 1) return { clientLastName: parts[0], clientFirstName: '' };
  return { clientLastName: parts[0], clientFirstName: parts.slice(1).join(' ') };
};

export const parseDossierRelativePath = (
  relativePath: string,
  opts?: { ignoreRootFolder?: boolean }
): ParsedDossierPath => {
  const ignoreRootFolder = opts?.ignoreRootFolder ?? true;

  const segs = splitSegments(relativePath);
  const fileName = segs[segs.length - 1] || '';
  const folders = segs.slice(0, -1);
  const normalizedFolders = ignoreRootFolder ? folders.slice(1) : folders;

  const clientSeg = normalizedFolders[0] || '';
  const projectSeg = normalizedFolders[1] || '';
  // Support both:
  // - Client/Projet/Fichier.ext  -> pieceName from filename
  // - Client/Projet/Piece/Fichier.ext (or deeper) -> pieceName from "Piece" folder
  const pieceFolderSeg = normalizedFolders.length >= 3 ? normalizedFolders[2] : '';

  const client = parseClientSegment(clientSeg);
  const projectName = cleanSegment(projectSeg);

  return {
    ...client,
    projectName,
    pieceName: cleanSegment(pieceFolderSeg) || cleanSegment(stripExt(fileName)),
  };
};

export const getWebkitRelativePath = (file: File): string => {
  const anyFile = file as unknown as { webkitRelativePath?: string };
  return anyFile.webkitRelativePath || file.name;
};

export const isAllowedDossierFile = (file: File): boolean => {
  const name = String(file.name || '').toLowerCase();
  // Common junk files: ignore to reduce noise.
  if (name === 'thumbs.db') return false;
  if (name === '.ds_store') return false;
  return true;
};
