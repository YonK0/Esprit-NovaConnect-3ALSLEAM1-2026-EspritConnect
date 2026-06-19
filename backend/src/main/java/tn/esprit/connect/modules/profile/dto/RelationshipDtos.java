package tn.esprit.connect.modules.profile.dto;

import tn.esprit.connect.modules.group.entity.GroupType;

import java.util.UUID;

public final class RelationshipDtos {
    private RelationshipDtos() {}

    public record MutualConnection(UUID userId, String email, String firstName, String lastName,
                                    Integer promotionYear, String specialtyCode) {}

    public record SharedGroup(UUID groupId, String name, GroupType type) {}
}
