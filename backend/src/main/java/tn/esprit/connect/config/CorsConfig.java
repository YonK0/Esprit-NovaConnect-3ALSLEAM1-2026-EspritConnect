package tn.esprit.connect.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
public class CorsConfig {

    // Comma-separated origin PATTERNS. Default "*" so the app works behind any
    // host the browser uses (localhost, a LAN IP, a Cloudflare/ngrok/Tailscale
    // tunnel, a printed-QR URL, a real domain) with no per-host reconfig. This
    // is safe here because auth is a Bearer token in localStorage (not cookies),
    // so a foreign origin can't ride a user's credentials. Lock it down for a
    // hardened prod by setting CORS_ALLOWED_ORIGINS to explicit origins.
    @Value("${app.security.cors.allowed-origins:*}")
    private String allowedOrigins;

    @Bean
    public UrlBasedCorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        // setAllowedOriginPatterns (not setAllowedOrigins) so "*" is valid even
        // with allowCredentials(true) — Spring reflects the request's Origin.
        cfg.setAllowedOriginPatterns(Arrays.asList(allowedOrigins.split(",")));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setExposedHeaders(List.of("Authorization", "Location"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
