import React from 'react';
import { createPortal } from 'react-dom';
import styles from '../styles/PhotoModal.module.css';

const PhotoModal = ({ photo, onClose, onSave, isSaved }) => {
  const modal = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          ×
        </button>

        <div className={styles.content}>
          <div className={styles.imageWrapper}>
            <img
              src={photo.imageUrl}
              alt={photo.title}
              className={styles.image}
              onError={(event) => {
                event.currentTarget.src = `https://placehold.co/900x1200/101916/e8fff2?text=${encodeURIComponent(
                  photo.title || 'DreamDwell'
                )}`;
              }}
            />
          </div>

          <div className={styles.details}>
            <div>
              <p className={styles.kicker}>{photo.style}</p>
              <h2 className={styles.title}>{photo.title}</h2>
              <p className={styles.description}>{photo.description}</p>
            </div>

            <div className={styles.metadata}>
              <div className={styles.metaItem}>
                <span className={styles.label}>Room</span>
                <span className={styles.value}>{photo.room}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.label}>Mood</span>
                <span className={styles.value}>{photo.mood || 'Curated for you'}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.label}>Why it matched</span>
                <span className={styles.value}>{photo.matchReason || 'Aligned with your recent design signals.'}</span>
              </div>

              {photo.colors && photo.colors.length > 0 && (
                <div className={styles.metaItem}>
                  <span className={styles.label}>Palette</span>
                  <div className={styles.colorPalette}>
                    {photo.colors.map((color) => (
                      <div
                        key={color}
                        className={styles.colorSwatch}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.saveBtn} ${isSaved ? styles.saved : ''}`}
                onClick={onSave}
              >
                {isSaved ? 'Saved to Archive' : 'Save to Archive'}
              </button>

              {photo.shopUrl && (
                <a
                  href={photo.shopUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.shopBtn}
                >
                  Shop This Look
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default PhotoModal;
