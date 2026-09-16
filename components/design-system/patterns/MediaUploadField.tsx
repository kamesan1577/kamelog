import * as React from "react";

export interface MediaUploadFieldProps
  extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ReactNode;
  label: React.ReactNode;
  labelClassName?: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  status?: React.ReactNode;
}

export function MediaUploadField({
  className,
  icon,
  label,
  labelClassName,
  accept,
  multiple = false,
  disabled = false,
  onFilesSelected,
  status,
  ...props
}: MediaUploadFieldProps) {
  return (
    <div data-ds="media-upload-field" className={className} {...props}>
      <label className={labelClassName}>
        {icon}
        {label}
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            onFilesSelected(Array.from(event.target.files || []));
            event.target.value = "";
          }}
        />
      </label>
      {status}
    </div>
  );
}
