package com.voisetu.backend.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class DashboardRepository {

    private final JdbcTemplate jdbcTemplate;

    public DashboardRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // --- Projects ---
    public List<Map<String, Object>> getProjects(Long userId) {
        return jdbcTemplate.queryForList(
                "SELECT id, name, created_at FROM project WHERE user_id = ? ORDER BY created_at DESC",
                userId
        );
    }

    public Long createProject(Long userId, String name) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO project (user_id, name) VALUES (?, ?)",
                    new String[]{"id"}
            );
            ps.setLong(1, userId);
            ps.setString(2, name);
            return ps;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public void updateProject(Long userId, Long projectId, String name) {
        jdbcTemplate.update(
                "UPDATE project SET name = ? WHERE id = ? AND user_id = ?",
                name, projectId, userId
        );
    }

    public void deleteProject(Long userId, Long projectId) {
        jdbcTemplate.update("DELETE FROM project WHERE id = ? AND user_id = ?", projectId, userId);
    }

    // --- Usage Daily ---
    public Map<String, Object>      getUsageToday(Long userId) {
        List<Map<String, Object>> res = jdbcTemplate.queryForList(
                "SELECT characters_used, generation_count FROM usage_daily WHERE user_id = ? AND usage_date = ?", 
                userId, Date.valueOf(LocalDate.now())
        );
        if (res.isEmpty()) {
            return Map.of("characters_used", 0, "generation_count", 0);
        }
        return res.get(0);
    }

    public void upsertUsage(Long userId, int charCount) {
        jdbcTemplate.update(
                "INSERT INTO usage_daily (user_id, usage_date, characters_used, generation_count) " +
                "VALUES (?, ?, ?, 1) " +
                "ON CONFLICT (user_id, usage_date) DO UPDATE " +
                "SET characters_used = usage_daily.characters_used + EXCLUDED.characters_used, " +
                "    generation_count = usage_daily.generation_count + 1",
                userId, Date.valueOf(LocalDate.now()), charCount
        );
    }

    // --- Generations ---
    public Long createGeneration(Long userId, Long projectId, Long voiceId, String text, int charCount) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO generation (user_id, project_id, voice_id, input_text, char_count, status) VALUES (?, ?, ?, ?, ?, ?)",
                    new String[]{"id"}
            );
            ps.setObject(1, userId);
            ps.setObject(2, projectId);
            ps.setLong(3, voiceId);
            ps.setString(4, text);
            ps.setInt(5, charCount);
            ps.setString(6, "pending");
            return ps;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public void updateGenerationSuccess(Long id, String audioPath, double duration) {
        jdbcTemplate.update(
                "UPDATE generation SET status = 'success', audio_path = ?, duration_seconds = ? WHERE id = ?",
                audioPath, duration, id
        );
    }

    public void updateGenerationFailed(Long id) {
        jdbcTemplate.update("UPDATE generation SET status = 'failed' WHERE id = ?", id);
    }

    public List<Map<String, Object>> getGenerations(Long userId, Long projectId, int limit, int offset) {
        if (projectId != null) {
            return jdbcTemplate.queryForList(
                    "SELECT g.id, g.input_text, g.duration_seconds, g.status, g.created_at, g.is_liked, v.display_name AS voice_name " +
                    "FROM generation g JOIN voice v ON g.voice_id = v.id " +
                    "WHERE g.user_id = ? AND g.project_id = ? " +
                    "ORDER BY g.created_at DESC LIMIT ? OFFSET ?",
                    userId, projectId, limit, offset
            );
        } else {
            return jdbcTemplate.queryForList(
                    "SELECT g.id, g.input_text, g.duration_seconds, g.status, g.created_at, g.is_liked, v.display_name AS voice_name " +
                    "FROM generation g JOIN voice v ON g.voice_id = v.id " +
                    "WHERE g.user_id = ? " +
                    "ORDER BY g.created_at DESC LIMIT ? OFFSET ?",
                    userId, limit, offset
            );
        }
    }
    
    public void toggleGenerationLike(Long userId, Long generationId) {
        jdbcTemplate.update(
            "UPDATE generation SET is_liked = NOT is_liked WHERE id = ? AND user_id = ?",
            generationId, userId
        );
    }
    
    public Optional<String> getGenerationAudioPath(Long userId, Long generationId) {
        List<String> res = jdbcTemplate.queryForList(
                "SELECT audio_path FROM generation WHERE id = ? AND user_id = ?",
                String.class, generationId, userId
        );
        return res.isEmpty() ? Optional.empty() : Optional.ofNullable(res.get(0));
    }
    
    public void deleteGeneration(Long userId, Long generationId) {
        jdbcTemplate.update("DELETE FROM generation WHERE id = ? AND user_id = ?", generationId, userId);
    }

    public List<String> getAllUserAudioPaths(Long userId) {
        return jdbcTemplate.queryForList("SELECT audio_path FROM generation WHERE user_id = ? AND audio_path IS NOT NULL", String.class, userId);
    }
}
