package com.voisetu.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

@Service
public class AudioStorageService {
    private final String audioDir;

    public AudioStorageService(@Value("${app.storage.audio-dir:backend-data/audio}") String audioDir) {
        this.audioDir = audioDir;
    }

    public File saveWav(Long userId, Long generationId, byte[] audioBytes) throws IOException {
        File userDir = new File(audioDir, userId.toString());
        if (!userDir.exists()) userDir.mkdirs();
        File audioFile = new File(userDir, generationId + ".wav");
        try (FileOutputStream fos = new FileOutputStream(audioFile)) {
            fos.write(audioBytes);
        } 
        
        return audioFile;
    }
}
