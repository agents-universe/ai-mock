import Editor from '@monaco-editor/react';
import '../../monaco-setup';

interface Props {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  language?: 'javascript' | 'json';
}

export function ScriptEditor({ value, onChange, readOnly, height = '360px', language = 'javascript' }: Props) {
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden" style={{ height }}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(v) => onChange?.(v ?? '')}
        theme="vs"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          tabSize: 2,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: 'on',
          quickSuggestions: false,
        }}
      />
    </div>
  );
}
