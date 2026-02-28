interface PropertyHeaderProps {
  imageUrl: string | null;
  address: string;
  location: string;
}

export function PropertyHeader({ imageUrl, address, location }: PropertyHeaderProps) {
  const hasImage = Boolean(imageUrl);

  return (
    <header className="property-header" aria-label="Property overview">
      <div
        className={`property-header__media${hasImage ? "" : " property-header__media--fallback"}`}
        style={hasImage ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        <div className="property-header__overlay" />
        <div className="property-header__content">
          <p className="property-header__eyebrow">Property</p>
          <h1>{address}</h1>
          <p className="property-header__location">{location}</p>
        </div>
      </div>
    </header>
  );
}
