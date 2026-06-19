package tn.esprit.connect.modules.directory.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import tn.esprit.connect.modules.directory.dto.DirectorySearchResult;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;

import java.util.List;

@Service
@RequiredArgsConstructor
public class DirectoryService {

    private final ProfileRepository profileRepository;

    public List<DirectorySearchResult> search(String query, int limit) {
        if (query == null || query.isBlank()) {
            return List.of();
        }

        return profileRepository.search(query, PageRequest.of(0, limit))
                .stream()
                .map(p -> new DirectorySearchResult(
                        p.getId(),
                        p.getFirstName(),
                        p.getLastName(),
                        p.getHeadline(),
                        p.getSpecialty() != null ? p.getSpecialty().getCode() : null,
                        p.getCity(),
                        p.getCountry(),
                        p.getAvatarUrl()
                ))
                .toList();
    }
}
