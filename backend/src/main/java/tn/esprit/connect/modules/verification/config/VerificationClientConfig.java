package tn.esprit.connect.modules.verification.config;

import io.netty.channel.ChannelOption;
import io.netty.handler.timeout.ReadTimeoutHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Builds a dedicated WebClient for the Python verification service.
 *
 * The Ollama WebClient ({@link tn.esprit.connect.config.OllamaConfig})
 * is a separate bean — we don't share clients because the timeouts and
 * base URLs differ.
 */
@Configuration
@RequiredArgsConstructor
public class VerificationClientConfig {

    private final VerificationProperties props;

    @Bean(name = "verificationWebClient")
    public WebClient verificationWebClient() {
        int timeoutSeconds = props.getPython().getTimeoutSeconds();

        HttpClient http = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(timeoutSeconds))
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 10_000)
                .doOnConnected(c -> c.addHandlerLast(
                        new ReadTimeoutHandler(timeoutSeconds, TimeUnit.SECONDS)));

        return WebClient.builder()
                .baseUrl(props.getPython().getBaseUrl())
                .clientConnector(new ReactorClientHttpConnector(http))
                .defaultHeader("X-Internal-Secret", props.getPython().getSharedSecret())
                // Large enough for multipart responses containing base64 face crops
                .codecs(c -> c.defaultCodecs().maxInMemorySize(8 * 1024 * 1024))
                .build();
    }
}
