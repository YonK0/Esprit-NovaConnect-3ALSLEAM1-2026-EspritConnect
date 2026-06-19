package tn.esprit.connect.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tn.esprit.connect.modules.auth.dto.SignupRequest;
import tn.esprit.connect.modules.profile.entity.Specialty;
import tn.esprit.connect.modules.profile.repository.SpecialtyRepository;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthFlowIntegrationTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private SpecialtyRepository specialtyRepository;

    @Test
    void signup_then_login_fails_until_active() throws Exception {
        specialtyRepository.save(Specialty.builder().code("GL").name("Génie Logiciel").build());

        SignupRequest req = new SignupRequest("test.user@esprit.tn", "Strong123",
                "Test", "User", "Tunisia", List.of(2022), "GL", null);

        mvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("test.user@esprit.tn"))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void signup_with_weak_password_returns_400() throws Exception {
        SignupRequest req = new SignupRequest("weak@esprit.tn", "weakpass",
                "T", "U", "Tunisia", List.of(2022), "GL", null);

        mvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(req)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors").isArray());
    }
}
