
import React from 'react';
import Masonry from 'react-masonry-css';
import styles from '../styles/PhotoGrid.module.css';


const breakpointColumnsObj = {
  default: 4,
  1200: 3,
  900: 2,
  600: 1,
};

const fallbackImages = [
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1584622050111-993a426fbf0a?auto=format&fit=crop&w=900&q=80',
];

const PhotoGrid = ({ photos, onPhotoClick, onSave, saved, onPhotoDragStart }) => {
  return (
    <Masonry
      breakpointCols={breakpointColumnsObj}
      className={styles.masonryGrid}
      columnClassName={styles.masonryColumn}
    >
      {photos
        .filter((photo) => !`${photo.id || ''}`.startsWith('live-'))
        .map((photo, index) => (
        <article
          key={photo.id}
          className={styles.gridItem}
          draggable
          onDragStart={e => {
            if (onPhotoDragStart) onPhotoDragStart(e, photo);
            e.dataTransfer.setData('application/json', JSON.stringify(photo));
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => onPhotoClick?.(photo)}
        >
          <div className={styles.imageContainer}>
            <img
              src={photo.imageUrl}
              alt={photo.title}
              className={styles.image}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.src = fallbackImages[index % fallbackImages.length];
              }}
            />
            <div className={styles.overlay}>
              <div className={styles.topBar}>
                <span className={styles.roomBadge}>{photo.room}</span>
                <button
                  type="button"
                  aria-label={saved.has(photo.id) ? 'Remove from archive' : 'Save to archive'}
                  className={`${styles.saveBtn} ${saved.has(photo.id) ? styles.saved : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSave(photo);
                  }}
                  title={saved.has(photo.id) ? 'Remove from archive' : 'Save to archive'}
                >
                  <span className={styles.saveIcon}>{saved.has(photo.id) ? '♥' : '+'}</span>
                </button>
              </div>

              <div className={styles.info}>
                <p className={styles.style}>{photo.style}</p>
                <h3>{photo.title}</h3>
                <p className={styles.description}>{photo.matchReason}</p>
              </div>
            </div>
          </div>

          <div className={styles.cardFooter}>
            <strong>{photo.title}</strong>
            <span>{photo.style}</span>
            <span className={styles.footerHint}>
              {index < 6 ? 'Strong match for your recent AI activity' : 'More ideas you may like'}
            </span>
          </div>
        </article>
        ))}
    </Masonry>
  );
};

export default PhotoGrid;
