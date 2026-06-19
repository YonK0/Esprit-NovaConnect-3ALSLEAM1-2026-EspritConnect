package tn.esprit.connect;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
@ConfigurationPropertiesScan("tn.esprit.connect")
public class EspritConnectApplication {
    public static void main(String[] args) {
        SpringApplication.run(EspritConnectApplication.class, args);
    }
}
