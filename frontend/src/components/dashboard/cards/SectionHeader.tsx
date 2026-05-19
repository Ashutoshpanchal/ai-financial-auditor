interface SectionHeaderProps {
  number: string;
  tag: string;
}

export function SectionHeader({ number, tag }: SectionHeaderProps) {
  return (
    <div className="de-sec">
      <span className="de-sec-n">{number}</span>
      <div className="de-sec-line" />
      <span className="de-sec-tag">{tag}</span>
    </div>
  );
}
