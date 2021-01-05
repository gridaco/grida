import React from 'react';
// @ts-ignore
import styles from './index.module.scss';

// @ts-ignore
import videoPreview from '../../images/hero-video-preview.png';
// @ts-ignore
import videoPlayBtn from '../../images/video-play.svg';

export const VideoPlayer = () => {
  return (
    <>
      <div className={styles.video}>
        <img src={videoPreview} className={styles.video} alt="video preview" />
        <div></div>
        <img
          src={videoPlayBtn}
          className={styles.video_play}
          alt="video player button"
        />
      </div>
      {/* <div className={styles.video}>
          <iframe
            className={styles.video}
            src="https://www.youtube.com/embed/RIZjZFoDhRc?controls=0"
            // frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            // allowfullscreen
          ></iframe>
        </div> */}
    </>
  );
};
